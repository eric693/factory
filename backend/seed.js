const db = require('./db');
const { v4: uuidv4 } = require('uuid');

const customers = [
  { id: uuidv4(), name: '台達電子', contact: '王經理', phone: '02-8797-2088' },
  { id: uuidv4(), name: '鴻海精密', contact: '李主任', phone: '02-2268-3466' },
  { id: uuidv4(), name: '廣達電腦', contact: '陳課長', phone: '03-327-2345' },
];

const products = [
  { id: uuidv4(), code: 'P001', name: '鋁合金外殼 A型', unit: '個', std_hours: 0.5 },
  { id: uuidv4(), code: 'P002', name: '不鏽鋼支架 B型', unit: '個', std_hours: 1.2 },
  { id: uuidv4(), code: 'P003', name: '散熱模組 C型', unit: '組', std_hours: 2.0 },
  { id: uuidv4(), code: 'P004', name: '電源連接器', unit: '個', std_hours: 0.3 },
  { id: uuidv4(), code: 'P005', name: '精密齒輪組', unit: '組', std_hours: 3.5 },
];

const machines = [
  { id: uuidv4(), code: 'M001', name: 'CNC車床 #1', capacity_per_day: 8 },
  { id: uuidv4(), code: 'M002', name: 'CNC車床 #2', capacity_per_day: 8 },
  { id: uuidv4(), code: 'M003', name: '沖壓機 #1', capacity_per_day: 16 },
  { id: uuidv4(), code: 'M004', name: '組裝站 A', capacity_per_day: 8 },
  { id: uuidv4(), code: 'M005', name: '組裝站 B', capacity_per_day: 8 },
];

try {
  const insertCustomer = db.prepare('INSERT OR IGNORE INTO customers (id,name,contact,phone) VALUES (?,?,?,?)');
  customers.forEach(c => insertCustomer.run(c.id, c.name, c.contact, c.phone));

  const insertProduct = db.prepare('INSERT OR IGNORE INTO products (id,code,name,unit,std_hours) VALUES (?,?,?,?,?)');
  products.forEach(p => insertProduct.run(p.id, p.code, p.name, p.unit, p.std_hours));

  const insertMachine = db.prepare('INSERT OR IGNORE INTO machines (id,code,name,capacity_per_day) VALUES (?,?,?,?)');
  machines.forEach(m => insertMachine.run(m.id, m.code, m.name, m.capacity_per_day));

  // Sample orders
  const orderId1 = uuidv4();
  const orderId2 = uuidv4();
  const orderId3 = uuidv4();
  const orderId4 = uuidv4();

  const insertOrder = db.prepare(`INSERT OR IGNORE INTO orders (id,order_no,customer_id,customer_name,status,priority,due_date,note) VALUES (?,?,?,?,?,?,?,?)`);
  const insertItem = db.prepare(`INSERT OR IGNORE INTO order_items (id,order_id,product_id,product_name,product_code,qty,unit) VALUES (?,?,?,?,?,?,?)`);

  insertOrder.run(orderId1, 'ORD-2026-001', customers[0].id, customers[0].name, 'in_production', 1, '2026-06-05', '急件優先處理');
  insertItem.run(uuidv4(), orderId1, products[0].id, products[0].name, products[0].code, 500, '個');
  insertItem.run(uuidv4(), orderId1, products[3].id, products[3].name, products[3].code, 500, '個');

  insertOrder.run(orderId2, 'ORD-2026-002', customers[1].id, customers[1].name, 'scheduled', 2, '2026-06-10', '');
  insertItem.run(uuidv4(), orderId2, products[1].id, products[1].name, products[1].code, 200, '個');
  insertItem.run(uuidv4(), orderId2, products[2].id, products[2].name, products[2].code, 100, '組');

  insertOrder.run(orderId3, 'ORD-2026-003', customers[2].id, customers[2].name, 'pending', 2, '2026-06-15', '');
  insertItem.run(uuidv4(), orderId3, products[4].id, products[4].name, products[4].code, 50, '組');

  insertOrder.run(orderId4, 'ORD-2026-004', customers[0].id, customers[0].name, 'shipped', 3, '2026-05-25', '');
  insertItem.run(uuidv4(), orderId4, products[0].id, products[0].name, products[0].code, 1000, '個');

  // Sample work orders
  const woId1 = uuidv4();
  const woId2 = uuidv4();
  const woId3 = uuidv4();

  const insertWO = db.prepare(`INSERT OR IGNORE INTO work_orders (id,wo_no,order_id,product_name,product_code,planned_qty,completed_qty,machine_id,machine_name,operator,status,planned_start,planned_end) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  insertWO.run(woId1,'WO-2026-001',orderId1,products[0].name,products[0].code,500,320,machines[0].id,machines[0].name,'張師傅','in_progress','2026-05-26','2026-06-03');
  insertWO.run(woId2,'WO-2026-002',orderId1,products[3].name,products[3].code,500,0,machines[3].id,machines[3].name,'林師傅','pending','2026-06-02','2026-06-04');
  insertWO.run(woId3,'WO-2026-003',orderId2,products[1].name,products[1].code,200,0,machines[1].id,machines[1].name,'王師傅','scheduled','2026-06-04','2026-06-08');

  const insertLog = db.prepare(`INSERT OR IGNORE INTO progress_logs (id,work_order_id,qty,operator,note,logged_at) VALUES (?,?,?,?,?,?)`);
  insertLog.run(uuidv4(),woId1,150,'張師傅','上午班完成','2026-05-26 12:00:00');
  insertLog.run(uuidv4(),woId1,170,'張師傅','下午班完成','2026-05-26 18:00:00');

  console.log('Seed data inserted successfully');
} catch (e) {
  console.error('Seed error:', e.message);
}
