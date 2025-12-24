import * as cdk from "aws-cdk-lib";
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as events from "aws-cdk-lib/aws-events";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

const lambdaTimeout = 30;

export class FargateSpotInterruptionHandlerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // creating dynamo db table
    const table = new dynamodb.Table(this, 'aws_ecs_spot_interruption_handler_regsitry', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: 'aws_ecs_spot_interruption_handler_regsitry',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: 'taskId', type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: false,
    });

    // Evnent bridge rule which filters spot instance placement failure
    const eventBridgeRule = new events.Rule(
      this,
      "fargate-spot-interruption-event-rule",
      {
        ruleName: "fargate-spot-interruption-event-rule",
        eventPattern: {
          source: ["aws.ecs", "test.aws.ecs"],
          detailType: ["ECS Task State Change"],
          detail: {
            executionStoppedAt: [{ exists: false }],
            stoppedReason: ["Your Spot Task was interrupted."],
          },
        },
      }
    );

    const deadLetterQueueForEvents = new sqs.Queue(
      this,
      "fargate-spot-interruption-events-dead-letter-queue",
      {
        queueName: "fargate-spot-interruption-events-dead-letter-queue",
        visibilityTimeout: cdk.Duration.seconds(lambdaTimeout),
      }
    );

    const deadLetterQueueForEventsConfig = {
      maxReceiveCount: 3,
      queue: deadLetterQueueForEvents,
    };

    const eventsQueue = new sqs.Queue(
      this,
      "fargate-spot-interruption-events-queue",
      {
        queueName: "fargate-spot-interruption-events-queue",
        visibilityTimeout: cdk.Duration.seconds(lambdaTimeout),
        deadLetterQueue: deadLetterQueueForEventsConfig,
      }
    );

    // add sns topic as target for eventbridge rule
    eventBridgeRule.addTarget(new targets.SqsQueue(eventsQueue));

    try {
      const infraNotificationServiceQueue = sqs.Queue.fromQueueArn(
        this,
        "infra-notification-events-queue",
        `arn:aws:sqs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account
        }:infra-notification-events-queue`
      );
      // attaching infra notification sqs queue as target
      if (infraNotificationServiceQueue.queueArn)
        eventBridgeRule.addTarget(
          new targets.SqsQueue(infraNotificationServiceQueue, {
            message: events.RuleTargetInput.fromObject({
              applicationName: `${events.EventField.fromPath(
                "$.detail.group"
              )}`,
              message: `${events.EventField.fromPath(
                "$.detail.stoppedReason"
              )}`,
              eventType: "spot-interrupted",
              eventLookup: {
                lookup: {
                  source: "applicationName",
                  target: "application_name",
                  condition: "includes",
                },
                patternMatch: [
                  {
                    source: "event-type",
                    target: "event-registry",
                    condition: "includes",
                  },
                ],
              },
            }),
          })
        );
      else throw new Error("infra notification events queue not found");
    } catch (err) {
      console.error(err);
    }

    const eventQueueArn = eventsQueue.queueArn;

    const ecsFargateSpotInterruptionHandlerRole = new iam.Role(
      this,
      "revert-ecs-capacity-provider-strategy-handler-role",
      {
        roleName: "revert-ecs-capacity-provider-strategy-handler-role",
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    ecsFargateSpotInterruptionHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [eventQueueArn],
        actions: [
          "sqs:ChangeMessageVisibility",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:ReceiveMessage",
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    ecsFargateSpotInterruptionHandlerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    ecsFargateSpotInterruptionHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: [
          "ecs:ListTasks",
          "ecs:StopTask",
          "ecs:DescribeTasks",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "elasticloadbalancing:DeregisterTargets",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
          "dynamodb:UpdateTable",
          "dynamodb:GetRecords",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "events:PutEvents"
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    const ecsFargateSpotInterruptionHandler = new lambdaNodejs.NodejsFunction(
  this,
  "ecs-fargate-spot-interruption-handler",
  {
    functionName: "ecs-fargate-spot-interruption-handler",
    runtime: lambda.Runtime.NODEJS_18_X,
    entry: path.join(__dirname, "..", "resources", "ecs-fargate-spot-interruption-handler", "index.js"), // ← JS file
    handler: "handler",
    timeout: cdk.Duration.seconds(lambdaTimeout),
    environment: {
      revertConfigQueueUri: eventsQueue.queueUrl,
      TABLE_NAME: table.tableName,
    },
    role: ecsFargateSpotInterruptionHandlerRole,
    bundling: {
      minify: true,
      sourceMap: true,
      target: "node18",
      externalModules: ["aws-sdk"], // keep v2 external; v3 (@aws-sdk/*) gets bundled
    },
  }
);
table.grantReadWriteData(ecsFargateSpotInterruptionHandler);



    // add lambda as event queue target
    const lambdaEventSource = new lambdaEventSources.SqsEventSource(
      eventsQueue,
      {
        batchSize: 10,
        reportBatchItemFailures: true,
      }
    );

    ecsFargateSpotInterruptionHandler.addEventSource(lambdaEventSource);
  }
}