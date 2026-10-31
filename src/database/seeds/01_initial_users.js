import fs from 'fs';
import path from 'path';
import { hashPassword } from '../../utils/password.js';
import ROLES from '../../constants/roles.js';
import QRCode from 'qrcode';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
export const seed = async (knex) => {
  // Clear existing entries in correct order due to foreign keys
  await knex('visitors').del();
  await knex('payments').del();
  await knex('agreements').del();
  await knex('resident_pg_stays').del();
  await knex('rooms').del();
  await knex('floors').del();
  await knex('buildings').del();
  await knex('branches').del();
  await knex('pgs').del();
  await knex('users').del();

  const defaultPassword = await hashPassword('Admin@123456');

  // Insert seed users with roles: super_admin, admin, resident
  await knex('users').insert([
    {
      id: 1,
      name: 'Super Administrator',
      email: 'superadmin@example.com',
      password: defaultPassword,
      role: ROLES.SUPER_ADMIN,
      phone: '9800000001',
      gender: 'male',
      address: 'Corporate Headquarters, Ahmedabad',
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      name: 'Jasmin Korat (PG Owner)',
      email: 'admin@example.com',
      password: defaultPassword,
      role: ROLES.ADMIN,
      phone: '9876543210',
      gender: 'male',
      address: '101 Shivalik Heights, Rajkot, Gujarat',
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 3,
      name: 'Kishan Patel (Resident)',
      email: 'resident@example.com',
      password: defaultPassword,
      role: ROLES.RESIDENT,
      phone: '9876543211',
      gender: 'male',
      address: '22 Krishna Nagar, Surat, Gujarat',
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed PGs (Owner has multiple PGs)
  await knex('pgs').insert([
    {
      id: 1,
      owner_id: 2,
      name: 'HouseNest Green Park PG',
      type: 'boys',
      phone: '9876543210',
      email: 'greenpark@housenest.com',
      address: '45 Green Park Society, Kalawad Road',
      city: 'Rajkot',
      state: 'Gujarat',
      pincode: '360005',
      total_rooms: 15,
      total_beds: 45,
      amenities: JSON.stringify(['WiFi', 'Air Conditioner', 'Daily Food', 'Laundry', 'RO Water', 'CCTV']),
      rules: 'Gate closes at 10:30 PM. No smoking.',
      status: 'active',
      pg_upi_id: 'jasminkorat204@oksbi',
      pg_account_holder_name: 'HouseNest Sunshine PG',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      owner_id: 2,
      name: 'HouseNest Silver Star PG',
      type: 'coed',
      phone: '9876543210',
      email: 'silverstar@housenest.com',
      address: '88 Silver Star Complex, University Road',
      city: 'Rajkot',
      state: 'Gujarat',
      pincode: '360005',
      total_rooms: 20,
      total_beds: 60,
      amenities: JSON.stringify(['WiFi', 'Study Lounge', 'Gym', 'Meals Included', 'Biometric Entry']),
      rules: 'Visitors allowed till 8 PM only.',
      status: 'active',
      pg_upi_id: 'jasminkorat204@oksbi',
      pg_account_holder_name: 'HouseNest Silver Star PG',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed branches for PG facility matching dashboard UI designs
  await knex('branches').insert([
    {
      id: 1,
      pg_id: 1,
      name: 'Main Branch',
      location: 'Ahmedabad',
      total_rooms: 120,
      occupied_rooms: 96,
      available_rooms: 24,
      status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      pg_id: 1,
      name: 'Navrangpura Branch',
      location: 'Ahmedabad',
      total_rooms: 120,
      occupied_rooms: 96,
      available_rooms: 24,
      status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 3,
      pg_id: 1,
      name: 'Satellite Branch',
      location: 'Ahmedabad',
      total_rooms: 120,
      occupied_rooms: 96,
      available_rooms: 24,
      status: 'under_maintenance',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 4,
      pg_id: 1,
      name: 'Vastrapur Branch',
      location: 'Ahmedabad',
      total_rooms: 120,
      occupied_rooms: 96,
      available_rooms: 24,
      status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 5,
      pg_id: 1,
      name: 'SG Highway Branch',
      location: 'Ahmedabad',
      total_rooms: 120,
      occupied_rooms: 96,
      available_rooms: 24,
      status: 'upcoming',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed buildings for PGs
  await knex('buildings').insert([
    {
      id: 1,
      pg_id: 1,
      branch_id: 1,
      name: 'Main Building',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      pg_id: 1,
      branch_id: 1,
      name: 'West Wing',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 3,
      pg_id: 2,
      branch_id: 2,
      name: 'Main Building',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed floors for buildings
  await knex('floors').insert([
    {
      id: 1,
      pg_id: 1,
      building_id: 1,
      floor_number: 1,
      name: '1st Floor',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      pg_id: 1,
      building_id: 1,
      floor_number: 2,
      name: '2nd Floor',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 3,
      pg_id: 1,
      building_id: 2,
      floor_number: 1,
      name: '1st Floor',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 4,
      pg_id: 2,
      building_id: 3,
      floor_number: 1,
      name: '1st Floor',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed rooms matching UI designs
  const mainBuildingFloor2Rooms = [
    { id: 1, room_no: 'A-201', room_type: 'single', capacity: 1, size: '12 m*2', image: 'room-a201.jpg', status: 'occupied' },
    { id: 2, room_no: 'A-202', room_type: 'single', capacity: 1, size: '12 m*2', image: 'room-a202.jpg', status: 'occupied' },
    { id: 3, room_no: 'A-203', room_type: 'single', capacity: 1, size: '12 m*2', image: null, status: 'vacant' },
    { id: 4, room_no: 'A-204', room_type: 'double', capacity: 2, size: '18 m*2', image: null, status: 'occupied' },
    { id: 5, room_no: 'A-205', room_type: 'double', capacity: 2, size: '18 m*2', image: null, status: 'occupied' },
    { id: 6, room_no: 'A-206', room_type: 'single', capacity: 1, size: '12 m*2', image: null, status: 'maintenance' },
    { id: 7, room_no: 'A-207', room_type: 'single', capacity: 1, size: '12 m*2', image: null, status: 'occupied' },
    { id: 8, room_no: 'A-208', room_type: 'single', capacity: 1, size: '12 m*2', image: null, status: 'vacant' },
    { id: 9, room_no: 'A-209', room_type: 'single', capacity: 1, size: '12 m*2', image: null, status: 'occupied' },
    { id: 10, room_no: 'A-210', room_type: 'single', capacity: 1, size: '12 m*2', image: null, status: 'maintenance' },
    { id: 11, room_no: 'A-211', room_type: 'single', capacity: 1, size: '12 m*2', image: null, status: 'occupied' },
    { id: 12, room_no: 'A-212', room_type: 'single', capacity: 1, size: '12 m*2', image: null, status: 'out_of_service' },
  ].map((r) => ({
    ...r,
    pg_id: 1,
    branch_id: 1,
    building_id: 1,
    floor_id: 2,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  }));

  const westWingFloor1Rooms = [
    {
      id: 13,
      pg_id: 1,
      branch_id: 1,
      building_id: 2,
      floor_id: 3,
      room_no: 'W-101',
      room_type: 'triple',
      capacity: 3,
      size: '24 m*2',
      image: null,
      status: 'vacant',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ];

  await knex('rooms').insert([...mainBuildingFloor2Rooms, ...westWingFloor1Rooms]);

  // Insert seed resident stays (Resident stayed in PG 1 Room 1, now stays in PG 2 Room 1)
  await knex('resident_pg_stays').insert([
    {
      id: 1,
      resident_id: 3,
      pg_id: 1, // HouseNest Green Park PG
      branch_id: 1,
      room_id: 1, // Room A-201
      bed_number: 'Bed-1',
      monthly_rent: 9500.00,
      security_deposit: 10000.00,
      check_in_date: '2026-08-01',
      check_out_date: '2026-08-31',
      status: 'completed', // Month 1 stay completed
      notes: 'Resident relocated to Silver Star PG closer to office',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      resident_id: 3,
      pg_id: 1, // HouseNest Green Park PG
      branch_id: 1,
      room_id: 2, // Room A-202
      bed_number: 'Bed-1',
      monthly_rent: 12000.00,
      security_deposit: 12000.00,
      check_in_date: '2026-09-01',
      check_out_date: null,
      status: 'active', // Current active stay
      notes: 'Active resident with paid security deposit',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed payment records
  await knex('payments').insert([
    {
      id: 1,
      transaction_id: 'TXN1234567890123',
      receipt_no: 'RCPT-2026-0001',
      resident_id: 3,
      pg_id: 1,
      branch_id: 1,
      stay_id: 2,
      room_id: 2,
      title: 'Rent - Feb 2026',
      payment_type: 'rent',
      billing_period_start: '2026-02-01',
      billing_period_end: '2026-02-28',
      due_date: '2026-02-25',
      rent_amount: 10000.00,
      maintenance_amount: 0.00,
      electricity_amount: 0.00,
      other_amount: 0.00,
      amount: 10000.00,
      paid_amount: 10000.00,
      payment_method: 'upi',
      payment_method_details: 'UPI GPay',
      upi_id: 'resident@okhdfcbank',
      status: 'paid',
      paid_at: '2026-03-24 10:32:00',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      transaction_id: 'TXN1234567890124',
      receipt_no: 'RCPT-2026-0002',
      resident_id: 3,
      pg_id: 1,
      branch_id: 1,
      stay_id: 2,
      room_id: 2,
      title: 'Maintenance Fee',
      payment_type: 'maintenance',
      billing_period_start: '2026-02-01',
      billing_period_end: '2026-02-28',
      due_date: '2026-02-25',
      rent_amount: 0.00,
      maintenance_amount: 1000.00,
      electricity_amount: 0.00,
      other_amount: 0.00,
      amount: 1000.00,
      paid_amount: 1000.00,
      payment_method: 'upi',
      payment_method_details: 'UPI PhonePe',
      upi_id: 'resident@ybl',
      status: 'paid',
      paid_at: '2026-03-24 11:15:00',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 3,
      transaction_id: null,
      receipt_no: null,
      resident_id: 3,
      pg_id: 1,
      branch_id: 1,
      stay_id: 2,
      room_id: 2,
      title: 'Monthly Rent - March 2026',
      payment_type: 'rent',
      billing_period_start: '2026-03-01',
      billing_period_end: '2026-03-31',
      due_date: '2026-03-25',
      rent_amount: 10000.00,
      maintenance_amount: 1000.00,
      electricity_amount: 0.00,
      other_amount: 1000.00,
      amount: 12000.00,
      paid_amount: 0.00,
      payment_method: null,
      status: 'pending',
      paid_at: null,
      notes: 'Rent is due by 25th of every month. Late payment may attract a fine.',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 4,
      transaction_id: 'TXN00024B',
      receipt_no: 'RCPT-2026-0004',
      resident_id: 3,
      pg_id: 1,
      branch_id: 1,
      stay_id: 2,
      room_id: 2,
      title: 'Monthly Rent - Jan 2026',
      payment_type: 'rent',
      billing_period_start: '2026-01-01',
      billing_period_end: '2026-01-31',
      due_date: '2026-01-25',
      rent_amount: 15000.00,
      maintenance_amount: 0.00,
      electricity_amount: 0.00,
      other_amount: 0.00,
      amount: 15000.00,
      paid_amount: 15000.00,
      payment_method: 'card',
      payment_method_details: 'Visa ending in 4242',
      status: 'paid',
      paid_at: '2025-12-05 10:32:00',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 5,
      transaction_id: 'TXN00024C',
      receipt_no: 'RCPT-2026-0005',
      resident_id: 3,
      pg_id: 1,
      branch_id: 1,
      stay_id: 2,
      room_id: 2,
      title: 'Security Deposit Refund',
      payment_type: 'security_deposit',
      billing_period_start: null,
      billing_period_end: null,
      due_date: '2025-12-05',
      rent_amount: 0.00,
      maintenance_amount: 0.00,
      electricity_amount: 0.00,
      other_amount: 0.00,
      amount: 15000.00,
      paid_amount: 15000.00,
      payment_method: 'bank_transfer',
      payment_method_details: 'HDFC Net Banking',
      status: 'refunded',
      refund_amount: 15000.00,
      refund_reason: 'Deposit refunded after room checkout',
      refunded_at: '2025-12-05 10:32:00',
      paid_at: '2025-12-05 10:32:00',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed agreement records
  await knex('agreements').insert([
    {
      id: 1,
      agreement_no: 'AGR-2026-001',
      resident_id: 3, // Riya Sharma
      pg_id: 1,
      branch_id: 1,
      room_id: 2, // Room A-202
      room_type: 'single',
      agreement_type: 'rental',
      start_date: '2026-09-01',
      end_date: '2027-08-31',
      status: 'signed',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      agreement_no: 'AGR-2026-002',
      resident_id: 3, // Riya Sharma
      pg_id: 1,
      branch_id: 1,
      room_id: 1, // Room A-201
      room_type: 'single',
      agreement_type: 'rental',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      status: 'expired',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed visitor records (matching Admin & Resident Portal screens)
  const visitorUploadDir = path.join(process.cwd(), 'uploads', 'visitors');
  if (!fs.existsSync(visitorUploadDir)) {
    fs.mkdirSync(visitorUploadDir, { recursive: true });
  }

  const pass1 = 'VP-20260324-A1B2C1';
  const qr1 = `qr-${pass1}.png`;
  await QRCode.toFile(path.join(visitorUploadDir, qr1), pass1, { errorCorrectionLevel: 'H', margin: 2, width: 280 });

  const pass2 = 'VP-20260324-A1B2C2';
  const qr2 = `qr-${pass2}.png`;
  await QRCode.toFile(path.join(visitorUploadDir, qr2), pass2, { errorCorrectionLevel: 'H', margin: 2, width: 280 });

  const pass3 = 'VP-20260324-A1B2C3';
  const qr3 = `qr-${pass3}.png`;
  await QRCode.toFile(path.join(visitorUploadDir, qr3), pass3, { errorCorrectionLevel: 'H', margin: 2, width: 280 });

  const pass4 = 'VP-20260324-A1B2C4';
  const qr4 = `qr-${pass4}.png`;
  await QRCode.toFile(path.join(visitorUploadDir, qr4), pass4, { errorCorrectionLevel: 'H', margin: 2, width: 280 });

  await knex('visitors').insert([
    {
      id: 1,
      pass_code: pass1,
      visitor_name: 'Aarav Sharma',
      visitor_phone: '+91 56478 23456',
      resident_id: 3,
      pg_id: 1,
      room_id: 2,
      branch_id: 1,
      room_no: 'A-204',
      room_type: 'single',
      purpose: 'Meeting',
      visit_date: '2026-03-24',
      entry_time: '10:24 AM',
      exit_time: null,
      status: 'in_office',
      qr_code: qr1,
      created_by: 2,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      pass_code: pass2,
      visitor_name: 'Rohit Mehta',
      visitor_phone: '+91 98765 43210',
      resident_id: 3,
      pg_id: 1,
      room_id: 2,
      branch_id: 1,
      room_no: 'A-204',
      room_type: 'single',
      purpose: 'Delivery',
      visit_date: '2026-03-24',
      entry_time: '10:24 AM',
      exit_time: '11:15 AM',
      status: 'left',
      qr_code: qr2,
      created_by: 2,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 3,
      pass_code: pass3,
      visitor_name: 'Priya Verma',
      visitor_phone: '+91 98231 65432',
      resident_id: 3,
      pg_id: 1,
      room_id: 2,
      branch_id: 1,
      room_no: 'A-204',
      room_type: 'single',
      purpose: 'Family',
      visit_date: '2026-03-24',
      entry_time: '10:24 AM',
      exit_time: '01:30 PM',
      status: 'left',
      qr_code: qr3,
      created_by: 2,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 4,
      pass_code: pass4,
      visitor_name: 'Suresh Patel',
      visitor_phone: '+91 94280 12345',
      resident_id: 3,
      pg_id: 1,
      room_id: 2,
      branch_id: 1,
      room_no: 'A-204',
      room_type: 'single',
      purpose: 'Meeting',
      visit_date: '2026-03-24',
      entry_time: '10:24 AM',
      exit_time: null,
      status: 'in_office',
      qr_code: qr4,
      created_by: 2,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 5,
      pass_code: 'VP-20260324-PEND01',
      visitor_name: 'Karan Dave',
      visitor_phone: '+91 97245 88990',
      resident_id: 3,
      pg_id: 1,
      room_id: 2,
      branch_id: 1,
      room_no: 'A-204',
      room_type: 'single',
      purpose: 'Personal',
      visit_date: '2026-03-24',
      entry_time: '02:00 PM',
      exit_time: null,
      status: 'pending',
      qr_code: null,
      created_by: 3,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);
};
