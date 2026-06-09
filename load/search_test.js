import http from 'k6/http';
import { check, sleep } from 'k6';

const file = open("../tracks/00001.wav", "b")

export const options = {
    stages: [
        { duration: '30s', target: 1 },
        { duration: '1m', target: 2 },
        { duration: '1m', target: 3 },
        { duration: "30s", target: 1 },
        { duration: '5s', target: 0 },
    ],
};

export default function () {
  const data = {
    file: http.file(file, "00001.wav", "audio/wav"),
    mode: "exact",
  };
  
  const res = http.post(
    "http://127.0.0.1:63669/api/tracks/search", 
    data,
    {
      timeout: "120s",
    }
  );

  check(res, {
    "status is 200": (r) => r.status === 200,
    "response time < 50s": (r) => r.timings.duration < 50000,
  });
  
  sleep(3);
};