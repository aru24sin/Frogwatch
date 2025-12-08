import { sleep } from 'k6';
import http from 'k6/http';

export let options = {
  vus: 10,          // 10 virtual users
  duration: '30s',  // run test for 30 seconds
};

const BASE_URL = 'https://frogwatch-backend-1066546787031.us-central1.run.app';

export default function () {
  const res = http.get(`${BASE_URL}/healthz`);

  // (optional) log status to be sure
  // console.log(res.status);

  sleep(1);         // small pause between requests
}
