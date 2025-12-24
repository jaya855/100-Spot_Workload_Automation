import * as cdk from "aws-cdk-lib";
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

export class FargateSpotTaskPlacementErrorHandlerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Evnent bridge rule which filters spot instance placement failure
    const eventBridgeRule = new events.Rule(
      this,
      "fargate-spot-task-placement-failure-rule",
      {
        ruleName: "fargate-spot-task-placement-failure-rule",
        eventPattern: {
          detailType: ["ECS Deployment State Change", "ECS Service Action"],
          source: ["aws.ecs", "test.aws.ecs"],
          detail: {
            eventName: ["SERVICE_TASK_PLACEMENT_FAILURE"],
            reason: ["RESOURCE:FARGATE"],
            capacityProviderArns: [{ "exists": true }],
          },
        },
      }
    );

    const deadLetterQueueForEvents = new sqs.Queue(
      this,
      "fargate-spot-task-placement-failure-dead-letter-queue",
      {
        queueName: "fargate-spot-task-placement-failure-dead-letter-queue",
        visibilityTimeout: cdk.Duration.seconds(lambdaTimeout),
      }
    );

    const deadLetterQueueForEventsConfig = {
      maxReceiveCount: 3,
      queue: deadLetterQueueForEvents,
    };

    const eventsQueue = new sqs.Queue(
      this,
      "fargate-spot-task-placement-failure-events-queue",
      {
        queueName: "fargate-spot-task-placement-failure-events-queue",
        visibilityTimeout: cdk.Duration.seconds(lambdaTimeout),
        deadLetterQueue: deadLetterQueueForEventsConfig,
      }
    );

    const eventQueueArn = eventsQueue.queueArn;

    // add sqs queue as target for eventbridge rule
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
          new targets.SqsQueue(infraNotificationServiceQueue)
        );
      else throw new Error("infra notification events queue not found");
    } catch (err) {
      console.error(err);
    }

    const taskPlacementFailureHandlerRole = new iam.Role(
      this,
      "task-placement-failure-handler-role",
      {
        roleName: "task-placement-failure-handler-role",
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    taskPlacementFailureHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [eventQueueArn],
        actions: [
          "sqs:ChangeMessageVisibility",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:ReceiveMessage",
          "sqs:SendMessage",
        ],
        effect: iam.Effect.ALLOW,
      })
    );
    // creating dynamo db table
    const table = new dynamodb.Table(this, 'ecs-spot-provider-config-table', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      tableName: 'ecs-spot-provider-config-table',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: false,
    });
    console.log(table.tableArn)
    const dynamoDbPolicy = new iam.PolicyStatement({
      resources: [table.tableArn],
      actions: [
        "dynamodb:BatchGet*",
        "dynamodb:DescribeStream",
        "dynamodb:DescribeTable",
        "dynamodb:Get*",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchWrite*",
        "dynamodb:Update*",
        "dynamodb:PutItem",
      ],
    });

    taskPlacementFailureHandlerRole.addToPolicy(dynamoDbPolicy);

    taskPlacementFailureHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: [
          "ecs:ListAttributes",
          "ecs:DescribeTaskSets",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeClusters",
          "ecs:ListServices",
          "ecs:ListAccountSettings",
          "ecs:UpdateService",
          "ecs:ListTagsForResource",
          "ecs:ListTasks",
          "ecs:ListTaskDefinitionFamilies",
          "ecs:DescribeServices",
          "ecs:ListContainerInstances",
          "ecs:DescribeContainerInstances",
          "ecs:DescribeTasks",
          "ecs:ListTaskDefinitions",
          "ecs:ListClusters",
          "events:PutEvents",
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    taskPlacementFailureHandlerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    ); // only required if your function lives in a VPC

    // Lambda function to handle spot instance placement failure
    const taskPlacementFailureHandler = new lambda.Function(
      this,
      "fargate-spot-task-placement-failure-handler",
      {
        functionName: "fargate-spot-task-placement-failure-handler",
        runtime: lambda.Runtime.PYTHON_3_9,
        handler: "index.lambda_handler",
        code: lambda.Code.fromAsset(
          path.join(
            __dirname,
            "..",
            "resources/fargate-spot-task-placement-failure-handler"
          )
        ),
        timeout: cdk.Duration.seconds(lambdaTimeout),
        role: taskPlacementFailureHandlerRole,
      }
    );

    // add lambda as event queue target
    const lambdaEventSource = new lambdaEventSources.SqsEventSource(
      eventsQueue,
      {
        batchSize: 10,
        reportBatchItemFailures: true,
      }
    );

    taskPlacementFailureHandler.addEventSource(lambdaEventSource);

    const revertECSCapacityProviderStrategyHandlerRole = new iam.Role(
      this,
      "revertECSCapacityProviderStrategyHandlerRole",
      {
        roleName: "revert-ecs-capacity-provider-lambda-role",
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    revertECSCapacityProviderStrategyHandlerRole.addToPolicy(
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

    revertECSCapacityProviderStrategyHandlerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    revertECSCapacityProviderStrategyHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: [
          "ecs:ListAttributes",
          "ecs:DescribeTaskSets",
          "ecs:DescribeTaskDefinition",
          "ecs:DescribeClusters",
          "ecs:ListServices",
          "ecs:ListAccountSettings",
          "ecs:UpdateService",
          "ecs:ListTagsForResource",
          "ecs:ListTasks",
          "ecs:ListTaskDefinitionFamilies",
          "ecs:DescribeServices",
          "ecs:ListContainerInstances",
          "ecs:DescribeContainerInstances",
          "ecs:DescribeTasks",
          "ecs:ListTaskDefinitions",
          "ecs:ListClusters",
          "events:PutEvents",
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    revertECSCapacityProviderStrategyHandlerRole.addToPolicy(dynamoDbPolicy);


    // lambda function which reverts the config
    const revertECSCapacityProviderStrategyHandler = new lambda.Function(
      this,
      "ecs-capacity-provider-strategy-handler",
      {
        functionName: "ecs-capacity-provider-strategy-handler",
        runtime: lambda.Runtime.PYTHON_3_9,
        handler: "index.lambda_handler",
        code: lambda.Code.fromAsset(
          path.join(
            __dirname,
            "..",
            "resources/ecs-capacity-provider-strategy-handler"
          )
        ),
        timeout: cdk.Duration.seconds(lambdaTimeout),
        role: revertECSCapacityProviderStrategyHandlerRole,
      }
    );

    // creating an event bridge which triggers lambda function every day
    const cron = new events.Rule(
      this,
      "ecs-capacity-provider-strategy-revert-cron",
      {
        ruleName: "ecs-capacity-provider-strategy-revert-cron",
        schedule: events.Schedule.cron({ hour: "17", minute: "30" }),
        targets: [
          new targets.LambdaFunction(revertECSCapacityProviderStrategyHandler),
        ],
      }
    );
  }
}
