import { sleep } from 'k6';
import http from 'k6/http';

export let options = {
  vus: 10,          // 10 virtual users
  duration: '30s',  // run for 30 seconds
};

const BASE_URL = 'https://frogwatch-backend-1066546787031.us-central1.run.app';

export default function () {
  // If your endpoint is POST, this will still work even if it returns 401/403
  const payload = JSON.stringify({
    recordingId: 'test-recording-id',
    decision: 'approved',   // or 'rejected'
    comment: 'Load test review from k6',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      // Add Authorization header here later if you want authenticated tests
      // 'Authorization': 'Bearer YOUR_TOKEN',
    },
  };

  const res = http.post(`${BASE_URL}/expert/review`, payload, params);
  // console.log(res.status); // optional for debugging

  sleep(1);
}
