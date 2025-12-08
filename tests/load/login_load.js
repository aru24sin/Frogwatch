import { sleep } from 'k6';
import http from 'k6/http';

export let options = {
  vus: 10,
  duration: '30s',
};

const BASE_URL = 'https://frogwatch-backend-1066546787031.us-central1.run.app';

// TODO: use a real test user that actually exists
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';

export default function () {
  const payload = JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}/auth/login`, payload, params);
  // console.log(res.status); // optional
  sleep(1);
}
