import http from 'k6/http';
import { sleep } from 'k6';


export const options = {
    duration: __ENV.duration || "5m",
    vus: __ENV.vus || 70
}
let resp;

let URL = 'http://performance-engineering-poc-alb-838128952.ap-south-1.elb.amazonaws.com/delay?timeout=4000';
URL = "https://dev-nucleus.byjusorders.com/nucleusapi/usermanagement/healthcheck";

export default function () {
   resp = http.get(URL,{
    timeout: "5m"
  });
  if(resp.status != 200) {
    console.log(resp)
  }
}
