const jwt = require('jsonwebtoken');
const http = require('http');

// Generate JWT token with correct staff ID
const token = jwt.sign(
  { staffId: '697789768f174b43491cb0b8', role: 'Receptionist' },
  'your_super_secret_jwt_key_here_123456789'
);

console.log('Test token:', token);

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/staff/panel',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);

  res.setEncoding('utf8');
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    console.log('Response length:', body.length);
    try {
      const data = JSON.parse(body);
      console.log('Response keys:', Object.keys(data));
      console.log('Stats:', data.stats);
    } catch (e) {
      console.log('Raw response (first 500 chars):', body.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();