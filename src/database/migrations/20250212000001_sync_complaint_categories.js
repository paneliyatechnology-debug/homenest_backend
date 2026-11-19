/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const categories = [
    { id: 1, name: 'Cleaning', key: 'cleaning', icon: 'broom', description: 'Room, bathroom, corridor, or premise cleaning issues' },
    { id: 2, name: 'AC', key: 'ac', icon: 'snowflake', description: 'Air conditioner cooling, noise, or electrical issues' },
    { id: 3, name: 'WiFi', key: 'wifi', icon: 'wifi', description: 'Internet connectivity, speed, or connection issues' },
    { id: 4, name: 'Water', key: 'water', icon: 'water-drop', description: 'Water supply, geyser, pressure, or drinking water issues' },
    { id: 5, name: 'Food', key: 'food', icon: 'utensils', description: 'Meal quality, timing, hygiene, or catering issues' },
    { id: 6, name: 'Electricity', key: 'electricity', icon: 'lightning-bolt', description: 'Power cuts, switches, sockets, fan, or lighting issues' },
    { id: 7, name: 'Furniture', key: 'furniture', icon: 'sofa', description: 'Bed, mattress, wardrobe, chair, or table issues' },
    { id: 8, name: 'Plumbing', key: 'plumbing', icon: 'pipe-wrench', description: 'Drainage, pipe leakage, tap, or sanitary fixture issues' },
    { id: 9, name: 'Appliances', key: 'appliances', icon: 'fridge', description: 'Refrigerator, microwave, or TV issues' },
    { id: 10, name: 'Washing Machine', key: 'washing_machine', icon: 'washing-machine', description: 'Washing machine operation, drainage, or power issues' },
    { id: 11, name: 'Other', key: 'other', icon: 'more-horizontal', description: 'General or miscellaneous complaints' },
  ];

  for (const cat of categories) {
    const existing = await knex('complaint_categories').where({ id: cat.id }).first();
    if (existing) {
      await knex('complaint_categories').where({ id: cat.id }).update({
        name: cat.name,
        key: cat.key,
        icon: cat.icon,
        description: cat.description,
        is_active: true,
      });
    } else {
      await knex('complaint_categories').insert({
        id: cat.id,
        name: cat.name,
        key: cat.key,
        icon: cat.icon,
        description: cat.description,
        is_active: true,
      });
    }
  }

  // Deactivate any other categories beyond 11
  await knex('complaint_categories').where('id', '>', 11).update({ is_active: false });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  // Revert id 10 to Other and delete id 11
  await knex('complaint_categories').where({ id: 10 }).update({
    name: 'Other',
    key: 'other',
    icon: 'alert-circle',
    description: 'General or miscellaneous complaints',
    is_active: true,
  });
  await knex('complaint_categories').where({ id: 11 }).del();
}
