#!/usr/bin/env node
const jwt = require('jsonwebtoken');

// Create a JWT token
const token = jwt.sign(
  { staffId: '697789768f174b43491cb0b8', role: 'Receptionist' },
  'your_super_secret_jwt_key_here_123456789'
);

console.log('\n=== STAFF PANEL API TEST ===\n');
console.log('Authorization Token:', token);
console.log('\n=== API ENDPOINTS ===\n');
console.log('1. Login (POST):');
console.log('   URL: http://localhost:5000/api/staff/auth/login');
console.log('   Body: {"email":"receptionist@test.com","password":"password123"}');
console.log('\n2. Dashboard (GET):');
console.log('   URL: http://localhost:5000/api/staff/dashboard');
console.log('   Header: Authorization: Bearer ' + token);
console.log('\n3. Panel Data (GET):');
console.log('   URL: http://localhost:5000/api/staff/panel');
console.log('   Header: Authorization: Bearer ' + token);
console.log('\n4. Bookings (GET):');
console.log('   URL: http://localhost:5000/api/staff/bookings');
console.log('   Header: Authorization: Bearer ' + token);
console.log('\n5. Check-in Booking (PUT):');
console.log('   URL: http://localhost:5000/api/staff/bookings/{bookingId}/checkin');
console.log('   Header: Authorization: Bearer ' + token);
console.log('\n');