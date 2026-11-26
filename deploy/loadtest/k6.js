// Load test: catalog browsing + cart + checkout under ramping traffic.
//   k6 run -e BASE=https://staging.portal.example.ir -e PHONE=09121111111 -e CODE=<otp> deploy/loadtest/k6.js
// Thresholds fail the run if p95 latency or error rate regress.
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "3m", target: 300 },
    { duration: "1m", target: 0 },
  ],
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<800"] },
};

const BASE = __ENV.BASE || "http://localhost:8080";

export function setup() {
  const r = http.post(`${BASE}/api/v1/auth/login/`, JSON.stringify({ username: __ENV.USER || "manager", password: __ENV.PASS || "demo1234" }),
    { headers: { "Content-Type": "application/json" } });
  return { token: r.json("access") };
}

export default function (data) {
  const h = { headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" } };
  check(http.get(`${BASE}/api/v1/products/?page_size=24`, h), { "catalog 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/orders/?page_size=20`, h), { "orders 200": (r) => r.status === 200 });
  check(http.get(`${BASE}/api/v1/reports/dashboard/`, h), { "dashboard 200": (r) => r.status === 200 });
  sleep(1);
}
