

1. How SIGTERM works with spot termination
    - handling sigterm in application
    - on SIGTERM, deregistering the task

2. Is there any limit to spot capacity

3. Automated solution to deregister tasks and shutdown gracefully.

4. Zero downtime when running single instance.

desired count: 1 - fargate spot

2 -> sqs(4m) ->  


5. Unavailability of Fargate Spot capacity (how retry works?) 
    - deployment of 10 tasks with 50-50 ratio, how it behaves.

6. How deregistration delay works with spot instance termination when deregistering

7. How double SIGTERM works with spot termination + deregistering.

8. emiting a SIGTERM from node - in what scenario's SIGKILL is issued?

9. 1:4 ratio - will it help when no spot is available.

service a:
Desired count - 1 

fargate spot: 0 4
fargate :     0 1
