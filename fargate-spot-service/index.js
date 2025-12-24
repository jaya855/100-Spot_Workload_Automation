const express = require("express");
const server = express();
const logger = require('pino')();
const cors = require("cors");
const PORT = 3001;

const appServer = server.listen(PORT, () => {
    logger.info(`server started on PORT ${PORT}`)
});

const { networkInterfaces } = require('os');

const nets = networkInterfaces();


server.use(cors());

server.get("/", async (req, res) => {
    logger.info(`Invoking root endpoint`);
    res.status(200).send(`server is up and running`);
});

server.get("/healthcheck", async (req, res) => { 
    logger.info(`Invoking healthcheck endpoint`);
    res.status(200).json({
        "status": "success",
        "data": `healthcheck!!`,
        ip: nets
    })
});

server.get("/orders", (req, res) => {
    logger.info(`Invoking orders endpoint`);
    res.status(200).json({
        "status": "success",
        "ip":nets,
        "data": [
            {
                "orderId": "APOP83939"
            },
            {
                "orderId": "APOP832239"
            }
        ]
    })
});

server.get("/delay", (req, res) => {
    logger.info(`Invoking delay with ${req.query.timeout}`);
    setTimeout(() => {
        logger.info(`Served orders-after-2m`);
        res.status(200).json({
            "status": "success",
            "ip":nets,
            "data": [
                {
                    "orderId": "APOP81999"
                },
                {
                    "orderId": "APOP831999"
                }
            ]
        })
    }, req.query.timeout);
});



server.get("/issue-sigterm", (req, res) => {
    logger.info("invoking sig term endpoint");
    process.emit("SIGTERM");
    res.status(200).json({
        message: "issued SIGTERM & SIGKILL"
    })
});

server.get("/issue-sigkill", (req, res) => {
    logger.info("invoking sig kill endpoint");
    process.emit("SIGKILL");
    res.status(200).json({
        message: "issued SIGKILL"
    })
});

   process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received.');
    logger.info('stopped accepting new connections');
    
//     appServer.close(() => {
//         logger.info('http server is closed');
//     });

    setInterval(() => {
        logger.info("cleaning up!...."); 
     }, 10000);

    //  setTimeout(() => {
    //     clearInterval(intervalId);
    //  }, 120000);
});


if (process.pid) {
    logger.info('This process is your pid ' + process.pid);
}
