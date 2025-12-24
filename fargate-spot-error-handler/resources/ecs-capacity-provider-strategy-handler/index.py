import boto3
import json
import logging
import os
from boto3.dynamodb.conditions import Attr

logger = logging.getLogger("logger")
logger.setLevel(logging.INFO)

# -------------------------------
# Environment Variables (CDK will set these)
# -------------------------------
RESTORE_TABLE = os.environ.get("RESTORE_TABLE", "ecs_cp_restore_state")
CENTRAL_ACCOUNT = os.environ.get("CENTRAL_ACCOUNT_ID", "")
ASSUME_ROLE_NAME = os.environ.get("ASSUME_ROLE_NAME", "CentralSpotAutomationRole")

# -------------------------------
# AWS Clients (central account)
# -------------------------------
dynamo = boto3.resource("dynamodb").Table(RESTORE_TABLE)
sts = boto3.client("sts")
event_client = boto3.client("events")

# -------------------------------
# Helper: Assume Role into Workload Account
# -------------------------------
def assume_role(workload_account_id, region):
    role_arn = f"arn:aws:iam::{workload_account_id}:role/{ASSUME_ROLE_NAME}"
    logger.info(f"Assuming role: {role_arn}")

    creds = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName="SpotAutomationRestoreSession"
    )["Credentials"]

    session = boto3.session.Session(
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
        region_name=region,
    )

    return session


# -------------------------------
# Update ECS CP Strategy in Workload Account
# -------------------------------
def update_capacity_provider(session, cluster_name, service_name, cp_strategy):
    ecs = session.client("ecs")
    logger.info(f"Updating CP strategy for {cluster_name}/{service_name}: {cp_strategy}")

    response = ecs.update_service(
        cluster=cluster_name,
        service=service_name,
        capacityProviderStrategy=cp_strategy,
        forceNewDeployment=True
    )
    logger.info(f"ECS update response: {response}")
    return response


# -------------------------------
# Reset Scheduled Flag in DynamoDB
# -------------------------------
def update_config(item_id):
    response = dynamo.update_item(
        Key={'id': item_id},
        UpdateExpression='SET scheduled = :value',
        ExpressionAttributeValues={':value': False}
    )
    return response


# -------------------------------
# Main Handler
# -------------------------------
def lambda_handler(event, context):
    logger.info(f"Event Received: {json.dumps(event)}")

    # Fetch only scheduled restore items
    response = dynamo.scan(FilterExpression=Attr("scheduled").eq(True))
    data = response.get("Items", [])

    # Handle paginated scans
    while "LastEvaluatedKey" in response:
        response = dynamo.scan(
            FilterExpression=Attr("scheduled").eq(True),
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        data.extend(response.get("Items", []))

    logger.info(f"Services to restore: {data}")

    # Process each restore entry
    for row in data:
        try:
            logger.info(f"Processing row: {row}")

            config = json.loads(row["config"])
            cluster_name = config["cluster_name"]
            service_name = config["service_name"]
            cp_strategy = config["capacity_provider_strategy"]

            # Extract region + account from stored event
            event_details = json.loads(row["event"])
            arn = event_details["resources"][0]  # example: arn:aws:ecs:region:account:service/...
            arn_parts = arn.split(":")
            region = arn_parts[3]
            workload_account_id = arn_parts[4]

            # -------------------------------
            # Assume role into the workload account
            # -------------------------------
            session = assume_role(workload_account_id, region)

            # -------------------------------
            # Restore CP strategy
            # -------------------------------
            update_capacity_provider(session, cluster_name, service_name, cp_strategy)

            # -------------------------------
            # Update Dynamo scheduled flag
            # -------------------------------
            item_id = row["id"]
            update_response = update_config(item_id)
            # update_response = update_config(f"{cluster_name}::{service_name}")
            logger.info(f"DynamoDB updated for id={item_id}: {update_response}")
            # logger.info(f"DynamoDB updated: {update_response}")

            # -------------------------------
            # Emit EventBridge "RESTORE" event
            # -------------------------------
            details = event_details["detail"]
            details["eventName"] = "SERVICE_CAPACITY_PROVIDER_STRATEGY_RESTORE"
            details["serviceName"] = service_name

            event_payload = {
                "Source": "infra.notification.aws.ecs",
                "DetailType": "ECS Service Configuration Restore",
                "Resources": event_details["resources"],
                "Detail": json.dumps(details),
            }

            logger.info(f"Putting event: {event_payload}")
            event_client.put_events(Entries=[event_payload])

        except Exception as e:
            logger.error(f"Failed to restore CP strategy for {cluster_name}/{service_name}: {e}")

