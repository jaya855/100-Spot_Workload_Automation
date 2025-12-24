const {
    DynamoDBClient,
    GetItemCommand,
    PutItemCommand
} = require("@aws-sdk/client-dynamodb");

const {
    EventBridgeClient,
    PutEventsCommand
} = require("@aws-sdk/client-eventbridge");

const {
    ElasticLoadBalancingV2Client,
    DeregisterTargetsCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");

const {
    ECSClient,
    DescribeTasksCommand,
    DescribeTaskDefinitionCommand,
    DescribeServicesCommand
} = require("@aws-sdk/client-ecs");

const {
    STSClient,
    AssumeRoleCommand
} = require("@aws-sdk/client-sts");

const logger = console;

// --------------------
// Environment Variables
// --------------------
const REGISTRY_TABLE = process.env.REGISTRY_TABLE || "ecs_task_interruption_registry";
const ASSUME_ROLE_NAME = process.env.ASSUME_ROLE_NAME || "CentralSpotAutomationRole";

// --------------------
// Central Clients
// --------------------
const sts = new STSClient({});
const dynamo = new DynamoDBClient({});
const eventBridge = new EventBridgeClient({});

// --------------------
// Assume Role in Workload Account
// --------------------
async function assumeRole(workloadAccount, region) {
    const roleArn = `arn:aws:iam::${workloadAccount}:role/${ASSUME_ROLE_NAME}`;

    logger.info(`Assuming role: ${roleArn}`);

    const cmd = new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "SpotInterruptionSession"
    });

    const creds = (await sts.send(cmd)).Credentials;

    return {
        ecs: new ECSClient({
            region,
            credentials: creds
        }),
        elbv2: new ElasticLoadBalancingV2Client({
            region,
            credentials: creds
        })
    };
}

// --------------------
// DynamoDB – dedupe
// --------------------
async function isFirstOccurrence(taskId) {
    const params = {
        TableName: REGISTRY_TABLE,
        Key: { taskId: { S: taskId } }
    };

    const data = await dynamo.send(new GetItemCommand(params));

    // First time seeing this task
    if (!data.Item) {
        await dynamo.send(new PutItemCommand({
            TableName: REGISTRY_TABLE,
            Item: {
                taskId: { S: taskId },
                ts: { S: new Date().toISOString() }
            }
        }));

        return true;
    }

    return false;
}

// --------------------
// Utility extractors
// --------------------
function getInstanceIP(task) {
    for (const att of task.attachments) {
        if (att.type === "ElasticNetworkInterface") {
            for (const detail of att.details) {
                if (detail.name === "privateIPv4Address") {
                    return detail.value;
                }
            }
        }
    }
    return undefined;
}

function getExposedPort(taskDefinition) {
    for (const container of taskDefinition.containerDefinitions) {
        if (container.essential) {
            for (const pm of container.portMappings) {
                if (pm.protocol === "tcp") return pm.containerPort;
            }
        }
    }
}

function getTargetGroupArn(service, port) {
    for (const lb of service.loadBalancers) {
        if (lb.containerPort === port) return lb.targetGroupArn;
    }
}

// --------------------
// Main Handler
// --------------------
exports.handler = async (event) => {
    logger.info("Spot interruption event received");
    logger.info(JSON.stringify(event));

    const messages = event.Records;
    const failures = [];

    for (const msg of messages) {
        try {
            const body = JSON.parse(msg.body);
            const detail = body.detail;

            const { clusterArn, taskArn } = detail;

            // Extract region + account from clusterArn
            // arn:aws:ecs:region:account:cluster/name
            const arnParts = clusterArn.split(":");
            const region = arnParts[3];
            const accountId = arnParts[4];

            const { ecs, elbv2 } = await assumeRole(accountId, region);

            // --------------------
            // Describe task
            
            const taskRes = await ecs.send(new DescribeTasksCommand({
                cluster: clusterArn,
                tasks: [taskArn]
            }));

            const task = taskRes.tasks[0];
            if (!task) throw new Error("Task not found");

            const taskId = task.taskArn.split("/")[2];

            // dedupe
            const first = await isFirstOccurrence(taskId);
            if (!first) {
                logger.info(`Task ${taskId} already processed. Skipping.`);
                continue;
            }

            const ip = getInstanceIP(task);
            if (!ip) throw new Error("Could not extract task ENI IP");

            // --------------------
            // Describe Task Definition
            
            const td = await ecs.send(new DescribeTaskDefinitionCommand({
                taskDefinition: task.taskDefinitionArn
            }));

            const port = getExposedPort(td.taskDefinition);

            // --------------------
            // Describe Service
           
            const serviceName = task.group.split(":")[1];

            const svcRes = await ecs.send(new DescribeServicesCommand({
                cluster: clusterArn,
                services: [serviceName]
            }));

            const service = svcRes.services[0];
            const tgArn = getTargetGroupArn(service, port);

            logger.info(`Deregistering from TG ${tgArn}: ${ip}:${port}`);

            // --------------------
            // Deregister Target
            
            await elbv2.send(new DeregisterTargetsCommand({
                TargetGroupArn: tgArn,
                Targets: [{ Id: ip, Port: port }]
            }));

            // --------------------
            // Emit EventBridge Notification
            
            const eventOut = {
                Source: "infra.notification.aws.ecs",
                DetailType: "ECS Task Spot Interruption",
                Detail: JSON.stringify({
                    ...detail,
                    taskId,
                    serviceName
                })
            };

            await eventBridge.send(new PutEventsCommand({
                Entries: [eventOut]
            }));

            logger.info(`Completed interruption handling for task ${taskId}`);

        } catch (err) {
            logger.error(`Error processing message: ${msg.messageId}`);
            logger.error(err);
            failures.push({ itemIdentifier: msg.messageId });
        }
    }

    return { batchItemFailures: failures };
};
