/**
 * Seed data for the user manual's screenshots.
 *
 * One owner with five shops, one per business type the manual documents, so a
 * single login can reach every screen that needs a picture. Prices and names
 * are the ones a Dar es Salaam trader would recognise, because a screenshot
 * with Coca-Cola at 70/= teaches the reader to distrust the whole manual.
 */
import {
  PrismaClient, BusinessType, InventoryModel, PricingMode, TaxMode, UserRole,
  SubscriptionPlan, ProductType, PaymentMethod, ExpenseCategory, JobStatus, RoomStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const ZONE = 'Africa/Dar_es_Salaam';
const EMAIL = 'neema@mauzohalisi.co.tz';
const PASSWORD = 'Neema@2026';

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const between = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

async function main() {
  // Start clean so repeated runs do not stack duplicate months onto the charts.
  const old = await prisma.ownerAccount.findUnique({ where: { email: EMAIL } });
  if (old) {
    // Transactions hold a restricting reference to products, so the sales have
    // to go before the account cascade can reach the catalogue.
    const ids = (await prisma.shop.findMany({
      where: { ownerAccountId: old.id }, select: { id: true },
    })).map(s => s.id);
    if (ids.length) {
      await prisma.transaction.deleteMany({ where: { shopId: { in: ids } } });
      await prisma.stockMovement.deleteMany({ where: { shopId: { in: ids } } });
      await prisma.inventoryItem.deleteMany({ where: { shopId: { in: ids } } });
      await prisma.product.deleteMany({ where: { shopId: { in: ids } } });
    }
    await prisma.ownerAccount.delete({ where: { id: old.id } });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const account = await prisma.ownerAccount.create({
    data: {
      legalName: 'Neema Trading Co. Ltd',
      email: EMAIL,
      phone: '+255754112233',
      subscriptionPlan: SubscriptionPlan.GROWTH,
      subscriptionActive: true,
      subscriptionExpiresAt: new Date(Date.now() + 64 * 86_400_000),
    },
  });

  const owner = await prisma.user.create({
    data: {
      ownerAccountId: account.id,
      fullName: 'Neema Mwakalinga',
      email: EMAIL,
      phone: '+255754112233',
      phoneVerified: true,
      passwordHash,
      role: UserRole.ACCOUNT_OWNER,
    },
  });

  const makeShop = (
    tradingName: string, businessType: BusinessType, inventoryModel: InventoryModel,
    pricingMode: PricingMode, taxMode: TaxMode, phone: string,
  ) => prisma.shop.create({
    data: {
      ownerAccountId: account.id, tradingName,
      legalName: 'Neema Trading Co. Ltd',
      businessType, inventoryModel, pricingMode, taxMode,
      country: 'TZ', city: 'Dar es Salaam', currency: 'TZS', timezone: ZONE,
      phone, wizardCompleted: true,
      addressLine1: "Mtaa wa Msimbazi, Kariakoo",
      tin: '142-857-963',
    },
  });

  const duka = await makeShop('Duka la Neema', BusinessType.RETAIL_STORE,
    InventoryModel.SKU_VARIANT, PricingMode.FIXED, TaxMode.STANDARD_VAT, '+255754112233');
  const chemist = await makeShop('Afya Chemist', BusinessType.PHARMACY_CHEMIST,
    InventoryModel.BATCH_LOT, PricingMode.FIXED, TaxMode.EXEMPT_HEALTH, '+255754112244');
  const mgahawa = await makeShop('Mgahawa wa Kijani', BusinessType.RESTAURANT,
    InventoryModel.RECIPE_INGREDIENT, PricingMode.MENU_BASED, TaxMode.FAB_SERVICE_RATE, '+255754112255');
  const nyumba = await makeShop('Baobab Guest House', BusinessType.HOTEL_GUESTHOUSE,
    InventoryModel.AMENITY, PricingMode.BED_AND_BOARD, TaxMode.HOSPITALITY_RATE, '+255754112266');
  const fundi = await makeShop('Fundi Simu Workshop', BusinessType.REPAIR_WORKSHOP,
    InventoryModel.ASSET_SERIAL, PricingMode.TIME_BASED, TaxMode.SERVICE_RATE, '+255754112277');

  const shops = [duka, chemist, mgahawa, nyumba, fundi];
  for (const s of shops) {
    await prisma.userShopAccess.create({
      data: { userId: owner.id, shopId: s.id, role: UserRole.ACCOUNT_OWNER },
    });
  }

  await prisma.taxRule.create({
    data: { shopId: duka.id, name: 'VAT 18%', rate: 18, isDefault: true },
  });

  // ── Staff, so the Users page and the by-seller report have something to show
  const staff = [
    { fullName: 'Asha Juma',      email: 'asha@mauzohalisi.co.tz',    role: UserRole.CASHIER,         shop: duka },
    { fullName: 'Baraka Mushi',   email: 'baraka@mauzohalisi.co.tz',  role: UserRole.CASHIER,         shop: duka },
    { fullName: 'Hamisi Rajabu',  email: 'hamisi@mauzohalisi.co.tz',  role: UserRole.INVENTORY_STAFF, shop: duka },
    { fullName: 'Grace Kimaro',   email: 'grace@mauzohalisi.co.tz',   role: UserRole.RECEPTIONIST,    shop: nyumba },
  ];
  const staffUsers = [];
  for (const s of staff) {
    const u = await prisma.user.create({
      data: {
        ownerAccountId: account.id, fullName: s.fullName, email: s.email,
        passwordHash, role: s.role, phoneVerified: true,
        phone: '+2557' + between(10000000, 89999999),
      },
    });
    await prisma.userShopAccess.create({ data: { userId: u.id, shopId: s.shop.id, role: s.role } });
    staffUsers.push({ user: u, shopId: s.shop.id });
  }
  const tills = [owner, ...staffUsers.filter(s => s.shopId === duka.id).map(s => s.user)];

  // ── The retail shop: what a Kariakoo duka actually stocks ──────────────────
  const catalogue = [
    { name: 'Sukari Kilombero 1kg',     sku: 'SUK-1KG',   cat: 'Vyakula',    sell: 3200,  cost: 2650, qty: 180, rop: 30 },
    { name: 'Mchele Mbeya 5kg',         sku: 'MCH-5KG',   cat: 'Vyakula',    sell: 16500, cost: 13800, qty: 64, rop: 12 },
    { name: 'Unga wa Sembe Azam 10kg',  sku: 'UNG-10KG',  cat: 'Vyakula',    sell: 24000, cost: 20500, qty: 38, rop: 10 },
    { name: 'Mafuta Korie 3L',          sku: 'MAF-3L',    cat: 'Vyakula',    sell: 21500, cost: 18200, qty: 42, rop: 8 },
    { name: 'Maharage ya Soya 1kg',     sku: 'MAH-1KG',   cat: 'Vyakula',    sell: 4200,  cost: 3300, qty: 95, rop: 20 },
    { name: 'Chai Africafe 100g',       sku: 'CHA-100',   cat: 'Vinywaji',   sell: 4800,  cost: 3900, qty: 70, rop: 15 },
    { name: 'Coca-Cola 500ml',          sku: 'COK-500',   cat: 'Vinywaji',   sell: 1200,  cost: 850,  qty: 240, rop: 48 },
    { name: 'Maji Kilimanjaro 1.5L',    sku: 'MAJ-15',    cat: 'Vinywaji',   sell: 1000,  cost: 650,  qty: 160, rop: 36 },
    { name: 'Sabuni Jamaa 800g',        sku: 'SAB-800',   cat: 'Usafi',      sell: 3500,  cost: 2750, qty: 88, rop: 18 },
    { name: 'Omo 1kg',                  sku: 'OMO-1KG',   cat: 'Usafi',      sell: 6500,  cost: 5400, qty: 54, rop: 12 },
    { name: 'Colgate 100ml',            sku: 'COL-100',   cat: 'Usafi',      sell: 3800,  cost: 2900, qty: 9,  rop: 15 },
    { name: 'Mkaa Gunia',               sku: 'MKA-GUN',   cat: 'Nishati',    sell: 38000, cost: 31000, qty: 11, rop: 6 },
    { name: 'Betri Tigerhead AA',       sku: 'BET-AA',    cat: 'Nishati',    sell: 1500,  cost: 950,  qty: 0,  rop: 24 },
    { name: 'Daftari A4 96pg',          sku: 'DAF-96',    cat: 'Shule',      sell: 2200,  cost: 1500, qty: 130, rop: 30 },
    { name: 'Biskuti Nice Pack',        sku: 'BIS-NIC',   cat: 'Vitafunwa',  sell: 2500,  cost: 1800, qty: 76, rop: 20 },
    { name: 'Maziwa Tanga Fresh 500ml', sku: 'MAZ-500',   cat: 'Maziwa',     sell: 2000,  cost: 1550, qty: 4,  rop: 24 },
  ];

  const products: { id: string; name: string; sell: number; cost: number }[] = [];
  for (const p of catalogue) {
    const prod = await prisma.product.create({
      data: {
        shopId: duka.id, name: p.name, sku: p.sku, barcode: '69' + between(10000000, 99999999),
        category: p.cat, unit: 'ea', sellPrice: p.sell, costPrice: p.cost,
        reorderPoint: p.rop, reorderQty: p.rop * 2, type: ProductType.PRODUCT,
      },
    });
    await prisma.inventoryItem.create({
      data: { shopId: duka.id, productId: prod.id, quantity: p.qty, costPrice: p.cost },
    });
    await prisma.stockMovement.create({
      data: {
        shopId: duka.id, productId: prod.id, type: 'ADJUSTMENT', quantity: p.qty,
        unitCost: p.cost, note: 'Hisa ya kuanzia', userId: owner.id,
      },
    });
    products.push({ id: prod.id, name: p.name, sell: p.sell, cost: p.cost });
  }

  // ── Customers, including two who owe money ────────────────────────────────
  const customerNames = [
    'Mama Fatuma Said', 'Juma Mwinyi', 'Hotel Mikumi Ltd', 'Rehema Chacha',
    'Said Abdallah', 'Shule ya Msingi Mnazi', 'Zainabu Hassan', 'Peter Massawe',
  ];
  const customers = [];
  for (const n of customerNames) {
    customers.push(await prisma.customer.create({
      data: {
        shopId: duka.id, fullName: n, phone: '+2557' + between(10000000, 89999999),
        consentMarketing: true,
      },
    }));
  }

  // ── A month and a half of trading ─────────────────────────────────────────
  let receiptSeq = 1000;
  const sellOn = async (at: Date, count: number) => {
    for (let i = 0; i < count; i++) {
      const lines = Array.from({ length: between(1, 4) }, () => pick(products));
      const uniq = [...new Map(lines.map(l => [l.id, l])).values()];
      const items = uniq.map(p => {
        const quantity = between(1, 3);
        return {
          productId: p.id, name: p.name, quantity, unitLabel: 'ea',
          unitPrice: p.sell, lineTotal: p.sell * quantity,
        };
      });
      const subtotal = items.reduce((n, it) => n + it.lineTotal, 0);

      // A few sales go out on credit, so the Debts page is not empty.
      const onCredit = Math.random() < 0.05;
      const method = onCredit ? PaymentMethod.DEBIT
        : pick([PaymentMethod.CASH, PaymentMethod.CASH, PaymentMethod.MOBILE_MONEY, PaymentMethod.CARD]);
      const customer = onCredit || Math.random() < 0.3 ? pick(customers) : null;
      const when = new Date(at.getTime() + between(0, 10) * 3_600_000 + between(0, 59) * 60_000);

      await prisma.transaction.create({
        data: {
          shop: { connect: { id: duka.id } },
          cashier: { connect: { id: pick(tills).id } },
          ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
          status: 'COMPLETED', subtotal, total: subtotal,
          receiptNo: 'RCP-' + (++receiptSeq),
          createdAt: when, updatedAt: when,
          items: { create: items },
          payments: {
            create: [{
              method, amount: onCredit ? 0 : subtotal,
              providerName: method === PaymentMethod.MOBILE_MONEY
                ? pick(['M-Pesa', 'Tigo Pesa', 'Airtel Money']) : null,
              reference: method === PaymentMethod.MOBILE_MONEY
                ? 'S' + between(100000000, 999999999) : null,
              createdAt: when,
            }],
          },
        },
      });
    }
  };

  const today = new Date();
  const dayStart = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 6, 0, 0));

  const tradeMonth = async (y: number, m: number, lastDay: number) => {
    for (let d = 1; d <= lastDay; d++) {
      const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
      const busy = dow === 6 || dow === 5;                   // market days
      const quiet = dow === 0;                               // Sunday half-day
      await sellOn(dayStart(y, m, d), quiet ? between(4, 8) : busy ? between(18, 26) : between(8, 16));
    }
  };

  await tradeMonth(today.getFullYear(), today.getMonth(), today.getDate());
  const pm = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
  const py = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  await tradeMonth(py, pm, new Date(py, pm + 1, 0).getDate());

  // ── Expenses, so net profit is a real number and one day shows a loss ─────
  const expenses: [ExpenseCategory, string, number, string, 'this' | 'last'][] = [
    [ExpenseCategory.UTILITIES, 'LUKU na maji',               85_000, 'TANESCO / DAWASA', 'this'],
    [ExpenseCategory.TRANSPORT, 'Usafiri wa mzigo Kariakoo',  60_000, 'Bajaji',           'this'],
    [ExpenseCategory.SUPPLIES,  'Mifuko ya kubebea',          35_000, 'Msambazaji',       'this'],
    [ExpenseCategory.BANK_FEES, 'Makato ya M-Pesa',           18_500, 'Vodacom',          'this'],
    [ExpenseCategory.RENT,      'Kodi ya pango',             450_000, 'Mwenye jengo',     'last'],
    [ExpenseCategory.SALARIES,  'Mishahara ya wafanyakazi',  620_000, 'Wafanyakazi',      'last'],
    [ExpenseCategory.UTILITIES, 'LUKU na maji',               92_000, 'TANESCO / DAWASA', 'last'],
    [ExpenseCategory.MARKETING, 'Mabango na matangazo',       40_000, 'Printa',           'last'],
  ];
  // Rent and wages are paid at month end, so the current month carries only
  // the running costs. Booking a whole month of fixed costs against a few
  // days of trading would make a healthy shop look like it is losing money.
  for (const [category, description, amount, vendor, when] of expenses) {
    const thisMonth = when === 'this';
    const lastDayOf = new Date(py, pm + 1, 0).getDate();
    const d = thisMonth
      ? between(1, Math.max(1, today.getDate() - 1))
      : between(1, lastDayOf);
    await prisma.expense.create({
      data: {
        shopId: duka.id, category, description, amount, vendor,
        paymentMethod: 'MOBILE_MONEY',
        incurredAt: thisMonth
          ? dayStart(today.getFullYear(), today.getMonth(), d)
          : dayStart(py, pm, d),
        recordedById: owner.id, recordedByName: owner.fullName,
      },
    });
  }

  // ── Pharmacy ──────────────────────────────────────────────────────────────
  const meds = [
    { name: 'Panadol 500mg (pakiti)', sell: 2500,  cost: 1700, rx: false, generic: 'Paracetamol' },
    { name: 'Amoxicillin 500mg',      sell: 6500,  cost: 4600, rx: true,  generic: 'Amoxicillin' },
    { name: 'ORS Sachet',             sell: 800,   cost: 450,  rx: false, generic: 'Oral Rehydration Salts' },
    { name: 'Coartem 20/120',         sell: 9500,  cost: 7200, rx: true,  generic: 'Artemether/Lumefantrine' },
    { name: 'Bandeji 7.5cm',          sell: 3000,  cost: 1900, rx: false, generic: null },
  ];
  for (const m of meds) {
    const prod = await prisma.product.create({
      data: {
        shopId: chemist.id, name: m.name, sku: m.name.slice(0, 6).toUpperCase().replace(/\s/g, ''),
        category: 'Dawa', unit: 'ea', sellPrice: m.sell, costPrice: m.cost,
        requiresRx: m.rx, genericName: m.generic, reorderPoint: 20,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        shopId: chemist.id, productId: prod.id, quantity: between(25, 140), costPrice: m.cost,
        batchNo: 'B' + between(1000, 9999),
        expiryDate: new Date(Date.now() + between(60, 500) * 86_400_000),
      },
    });
  }

  // ── Restaurant: a menu and live kitchen tickets ───────────────────────────
  const menu = [
    { name: 'Wali wa Nazi na Samaki', price: 9000 },
    { name: 'Nyama Choma 1/4kg',      price: 12000 },
    { name: 'Ugali na Maharage',      price: 5000 },
    { name: 'Chips Mayai',            price: 6000 },
    { name: 'Chai ya Tangawizi',      price: 1500 },
    { name: 'Soda Baridi',            price: 1500 },
  ];
  for (const m of menu) {
    const prod = await prisma.product.create({
      data: {
        shopId: mgahawa.id, name: m.name, sku: m.name.slice(0, 8).toUpperCase().replace(/\s/g, ''),
        category: 'Menyu', unit: 'ea', sellPrice: m.price, costPrice: Math.round(m.price * 0.42),
        type: ProductType.MENU_ITEM, trackStock: false,
      },
    });
    void prod;
  }
  const tickets = [
    { tableNo: '4',  status: 'PREPARING', items: [{ name: 'Nyama Choma 1/4kg', quantity: 2 }, { name: 'Ugali na Maharage', quantity: 2 }] },
    { tableNo: '7',  status: 'PENDING',   items: [{ name: 'Wali wa Nazi na Samaki', quantity: 1 }, { name: 'Soda Baridi', quantity: 1 }] },
    { tableNo: '2',  status: 'READY',     items: [{ name: 'Chips Mayai', quantity: 3 }] },
    { tableNo: '11', status: 'PENDING',   items: [{ name: 'Chai ya Tangawizi', quantity: 4 }] },
  ];
  let ticketNo = 40;
  for (const tkt of tickets) {
    await prisma.kdsOrder.create({
      data: {
        shopId: mgahawa.id, station: 'kitchen', tableNo: tkt.tableNo,
        orderNo: 'K-' + (++ticketNo), status: tkt.status, items: tkt.items,
        sentAt: new Date(Date.now() - between(2, 24) * 60_000),
      },
    });
  }

  // ── Guest house: rooms in every state ─────────────────────────────────────
  const rooms: [string, string, number, RoomStatus][] = [
    ['101', 'Single',  35_000, RoomStatus.OCCUPIED],
    ['102', 'Single',  35_000, RoomStatus.AVAILABLE],
    ['103', 'Double',  55_000, RoomStatus.OCCUPIED],
    ['104', 'Double',  55_000, RoomStatus.RESERVED],
    ['201', 'Self-contained', 75_000, RoomStatus.AVAILABLE],
    ['202', 'Self-contained', 75_000, RoomStatus.MAINTENANCE],
    ['203', 'Family', 95_000, RoomStatus.CHECKOUT],
  ];
  for (const [roomNo, roomType, ratePerNight, status] of rooms) {
    const room = await prisma.room.create({
      data: { shopId: nyumba.id, roomNo, roomType, ratePerNight, status, floor: Number(roomNo[0]) },
    });
    if (status === RoomStatus.OCCUPIED || status === RoomStatus.RESERVED) {
      await prisma.roomReservation.create({
        data: {
          roomId: room.id,
          guestName: pick(['Daniel Komba', 'Sophia Mrema', 'John Lyimo', 'Halima Ally']),
          guestPhone: '+2557' + between(10000000, 89999999),
          checkInDate: new Date(Date.now() - between(0, 2) * 86_400_000),
          nights: between(1, 4),
        },
      });
    }
  }

  // ── Repair workshop: jobs on the bench ────────────────────────────────────
  const jobs: [string, string, string, JobStatus, number][] = [
    ['Tecno Spark 10',   'Skrini imepasuka',          'Skrini mpya inahitajika', JobStatus.AWAITING_PARTS, 65_000],
    ['Samsung A14',      'Haiwaki kabisa',            'Tatizo la chaja ya ndani', JobStatus.IN_PROGRESS,   45_000],
    ['Infinix Hot 30',   'Betri inaisha haraka',      '',                         JobStatus.OPEN,           30_000],
    ['HP Laptop 840 G5', 'Kibodi haifanyi kazi',      'Kibodi imemwagiwa maji',   JobStatus.COMPLETED,     120_000],
  ];
  let jobSeq = 200;
  for (const [deviceDesc, fault, diagnosis, status, totalAmount] of jobs) {
    await prisma.workOrder.create({
      data: {
        shopId: fundi.id, jobNo: 'JOB-' + (++jobSeq), deviceDesc, fault, diagnosis, status,
        labourHours: between(1, 4), labourRate: 15_000, totalAmount,
        serialNo: 'SN' + between(100000, 999999),
        createdAt: new Date(Date.now() - between(1, 9) * 86_400_000),
      },
    });
  }

  // ── Reports, so the schedule page shows a configured state ────────────────
  await prisma.reportPreference.create({
    data: {
      shopId: duka.id, daily: false, weekly: true, monthly: true,
      sendHour: 20, phone: '+255754112233', enabled: true,
    },
  });

  const txCount = await prisma.transaction.count({ where: { shopId: duka.id } });
  console.log(JSON.stringify({
    email: EMAIL, password: PASSWORD, shops: shops.map(s => s.tradingName), transactions: txCount,
  }, null, 2));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
