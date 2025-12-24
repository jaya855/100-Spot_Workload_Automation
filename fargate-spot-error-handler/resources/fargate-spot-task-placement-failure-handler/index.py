import boto3
import json
import logging
import os

logger = logging.getLogger("logger")
logger.setLevel(logging.INFO)

# -------------------------------
# Environment Variables (set via CDK)
# -------------------------------
RESTORE_TABLE = os.environ.get("RESTORE_TABLE", "ecs_cp_restore_state")
ASSUME_ROLE_NAME = os.environ.get("ASSUME_ROLE_NAME", "CentralSpotAutomationRole")

# DynamoDB table (in CENTRAL account)
dynamo = boto3.resource("dynamodb").Table(RESTORE_TABLE)

sts = boto3.client("sts")


# -------------------------------
# Assume Role into Workload Account
# -------------------------------
def assume_role(workload_account_id, region):
    role_arn = f"arn:aws:iam::{workload_account_id}:role/{ASSUME_ROLE_NAME}"
    logger.info(f"Assuming role in workload account: {role_arn}")

    creds = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName="SpotAutomationFailureSession"
    )["Credentials"]

    session = boto3.session.Session(
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
        region_name=region
    )

    return session


# -------------------------------
# Identify SPOT vs NON-SPOT CPs
# -------------------------------
def split_capacity_providers(capacity_providers):
    """
    SPOT providers → contain 'spot' in name
    NON-SPOT providers → the rest
    """
    spot_cps = []
    od_cps = []

    for cp in capacity_providers:
        name = cp["capacityProvider"].lower()

        if "spot" in name:
            spot_cps.append(cp)
        else:
            od_cps.append(cp)

    return spot_cps, od_cps


# -------------------------------
# Main Handler
# -------------------------------
def lambda_handler(event, context):
    logger.info(f"Event received: {json.dumps(event)}")

    records = event["Records"]
    messages_to_reprocess = []
    batch_failure_response = {}

    for record in records:
        try:
            message = json.loads(record["body"])
            logger.info(f"Processing message: {message}")

            # Full ARN → arn:aws:ecs:region:account:service/cluster/service
            arn = message["resources"][0]
            arn_parts = arn.split(":")

            region = arn_parts[3]
            workload_account_id = arn_parts[4]

            # Extract cluster & service
            res_parts = arn.split("/")
            cluster_name = res_parts[1]
            service_name = res_parts[2]

            logger.info(
                f"Cluster={cluster_name}, Service={service_name}, "
                f"Region={region}, Account={workload_account_id}"
            )

            # -------------------------------
            # Assume role into workload account
            # -------------------------------
            session = assume_role(workload_account_id, region)
            ecs = session.client("ecs")

            # Describe service
            service_info = ecs.describe_services(
                cluster=cluster_name,
                services=[service_name]
            )

            svc = service_info["services"][0]

            if "capacityProviderStrategy" not in svc:
                logger.info("No capacity provider strategy exists. Skipping.")
                continue

            original_cps = svc["capacityProviderStrategy"]
            logger.info(f"Original CP Strategy: {original_cps}")

            # -------------------------------
            # Build FAILURE strategy
            # SPOT = 0 weight, NON-SPOT = 10 weight
            # -------------------------------
            spot_cps, od_cps = split_capacity_providers(original_cps)

            failure_strategy = []

            # SPOT providers → disable
            for cp in spot_cps:
                failure_strategy.append({
                    "capacityProvider": cp["capacityProvider"],
                    "weight": 0,
                    "base": 0
                })

            # NON-SPOT providers → route 100% here
            for cp in od_cps:
                failure_strategy.append({
                    "capacityProvider": cp["capacityProvider"],
                    "weight": 10,
                    "base": 0
                })

            logger.info(f"Failure strategy applied: {failure_strategy}")

            # -------------------------------
            # Apply failure strategy
            # -------------------------------
            update_response = ecs.update_service(
                cluster=cluster_name,
                service=service_name,
                capacityProviderStrategy=failure_strategy,
                forceNewDeployment=True
            )

            logger.info(f"Update response: {update_response}")

            # -------------------------------
            # Save ORIGINAL config into DynamoDB for restore (UPSERT)
            # -------------------------------
            restore_item = {
                "id": f"{workload_account_id}::{cluster_name}::{service_name}",
                "config": json.dumps({
                    "cluster_name": cluster_name,
                    "service_name": service_name,
                    "capacity_provider_strategy": original_cps
                }),
                "event": json.dumps(message),
                "scheduled": True
            }

            # Overwrite existing entry (if exists)
            dynamo.put_item(Item=restore_item)

            logger.info("Upserted restore state into DynamoDB")

        except Exception as e:
            logger.error(f"Error processing {record['messageId']}: {e}")
            messages_to_reprocess.append({"itemIdentifier": record["messageId"]})

    batch_failure_response["batchItemFailures"] = messages_to_reprocess
    return batch_failure_response
