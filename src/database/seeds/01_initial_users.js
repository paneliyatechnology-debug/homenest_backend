import { hashPassword } from '../../utils/password.js';
import ROLES from '../../constants/roles.js';

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
export const seed = async (knex) => {
  // Clear existing entries in correct order due to foreign keys
  await knex('agreements').del();
  await knex('resident_pg_stays').del();
  await knex('rooms').del();
  await knex('floors').del();
  await knex('buildings').del();
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
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
  ]);

  // Insert seed buildings for PGs
  await knex('buildings').insert([
    {
      id: 1,
      pg_id: 1,
      name: 'Main Building',
      description: 'Primary residential block with dining hall',
      status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      pg_id: 1,
      name: 'West Wing',
      description: 'Quiet premium wing with study rooms',
      status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 3,
      pg_id: 2,
      name: 'Main Building',
      description: 'Coed residence main block',
      status: 'active',
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
      status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 2,
      pg_id: 1,
      building_id: 1,
      floor_number: 2,
      name: '2nd Floor',
      status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 3,
      pg_id: 1,
      building_id: 2,
      floor_number: 1,
      name: '1st Floor',
      status: 'active',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    },
    {
      id: 4,
      pg_id: 2,
      building_id: 3,
      floor_number: 1,
      name: '1st Floor',
      status: 'active',
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
    building_id: 1,
    floor_id: 2,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  }));

  const westWingFloor1Rooms = [
    {
      id: 13,
      pg_id: 1,
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

  // Insert seed agreement records
  await knex('agreements').insert([
    {
      id: 1,
      agreement_no: 'AGR-2026-001',
      resident_id: 3, // Riya Sharma
      pg_id: 1,
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
};
