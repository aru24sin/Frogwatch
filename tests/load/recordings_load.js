import { sleep } from 'k6';
import http from 'k6/http';

export let options = {
  vus: 50,
  duration: '30s',
};

const BASE_URL = 'https://frogwatch-backend-1066546787031.us-central1.run.app';

export default function () {
  const res = http.get(`${BASE_URL}/recordings`); // or /api/recordings or your real path
  // console.log(res.status); // optional
  sleep(1);
}
