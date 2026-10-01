const fs = require('fs');
const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID();
}

const adminId = 'a0000000-0000-0000-0000-000000000001'; 
const collectorId = 'a0000000-0000-0000-0000-000000000002'; 
const routeId = 'e2b34a62-7e04-4cc5-926e-9abcb640d287';

let sql = `-- MOCK DATA PARA 152 CLIENTES\n`;
sql += `INSERT INTO routes (id, name, description, active) VALUES ('${routeId}', 'Ruta Centro', 'Ruta principal', true) ON CONFLICT (id) DO NOTHING;\n\n`;
const assignId = uuid();
sql += `INSERT INTO route_assignments (id, route_id, collector_id, date_start, assigned_by) VALUES ('${assignId}', '${routeId}', '${collectorId}', CURRENT_DATE, '${adminId}') ON CONFLICT DO NOTHING;\n\n`;

const names = ['Juan', 'Maria', 'Carlos', 'Laura', 'Luis', 'Ana', 'Jose', 'Carmen', 'Pedro', 'Marta', 'Diego', 'Sofia', 'Jorge', 'Lucia', 'Miguel', 'Elena', 'Fernando', 'Paula', 'Roberto', 'Sara', 'Andres', 'Diana', 'Javier', 'Valentina', 'Ricardo', 'Camila', 'Alejandro', 'Daniela', 'Gabriel', 'Isabella'];
const surnames = ['Perez', 'Gomez', 'Ruiz', 'Diaz', 'Rodriguez', 'Gonzalez', 'Fernandez', 'Lopez', 'Martinez', 'Sanchez', 'Martin', 'Garcia', 'Romero', 'Suarez', 'Torres', 'Vargas', 'Rios', 'Castro', 'Ortiz', 'Silva'];

const amounts = [100000, 150000, 200000, 250000, 300000, 400000, 500000];

let valuesClients = [];
let valuesLoans = [];
let valuesInstallments = [];

const today = new Date();
today.setHours(0,0,0,0);

for(let k = 0; k < 152; k++) {
  const name = names[Math.floor(Math.random() * names.length)];
  const surname = surnames[Math.floor(Math.random() * surnames.length)];
  const doc = (10000000 + k).toString();
  const amount = amounts[Math.floor(Math.random() * amounts.length)];
  const rate = 0.2; 
  const term = 40; 
  const startDaysOffset = -Math.floor(Math.random() * 21);

  const clientId = uuid();
  valuesClients.push(`('${clientId}', '${name} ${surname}', '${doc}', '${routeId}', 'ACTIVO')`);

  const loanId = uuid();
  const interestAmount = amount * rate;
  const initialObligation = amount + interestAmount;
  const dailyInstallment = initialObligation / term; 

  const disbursementDate = new Date(today);
  disbursementDate.setDate(today.getDate() + startDaysOffset);
  const disbursementStr = disbursementDate.toISOString().split('T')[0];

  const startDate = new Date(disbursementDate);
  startDate.setDate(disbursementDate.getDate() + 1); 
  const startDateStr = startDate.toISOString().split('T')[0];

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + term - 1);
  const endDateStr = endDate.toISOString().split('T')[0];

  const graceEndDate = new Date(endDate);
  graceEndDate.setDate(endDate.getDate() + 7);
  const graceEndDateStr = graceEndDate.toISOString().split('T')[0];

  valuesLoans.push(`(
    '${loanId}', '${clientId}', '${routeId}', '${collectorId}',
    ${amount}, ${rate}, ${interestAmount}, ${initialObligation},
    ${term}, ${dailyInstallment}, 'DIARIO',
    0, 0, 0, ${amount}, ${initialObligation},
    '${disbursementStr}', '${startDateStr}', '${endDateStr}', '${graceEndDateStr}', 'ACTIVO', '${adminId}'
  )`);

  for(let i = 1; i <= term; i++) {
    const instId = uuid();
    const instDate = new Date(startDate);
    instDate.setDate(startDate.getDate() + (i - 1));
    const instDateStr = instDate.toISOString().split('T')[0];
    
    let status = 'PENDIENTE';
    if (instDate < today) status = 'ATRASADA';

    valuesInstallments.push(`(
      '${instId}', '${loanId}', ${i}, '${instDateStr}', ${dailyInstallment},
      0, ${dailyInstallment}, '${status}', 'NORMAL', false, false, false
    )`);
  }
}

function chunkArray(myArray, chunk_size){
    let results = [];
    while (myArray.length) {
        results.push(myArray.splice(0, chunk_size));
    }
    return results;
}

let fileCount = 1;

// Escribir Parte 1: Rutas, Clientes y Préstamos
let sqlPart1 = sql;
const clientsChunks = chunkArray(valuesClients, 50);
clientsChunks.forEach(chunk => {
  sqlPart1 += `INSERT INTO clients (id, full_name, document_id, route_id, status) VALUES \n${chunk.join(',\n')};\n\n`;
});
const loansChunks = chunkArray(valuesLoans, 50);
loansChunks.forEach(chunk => {
  sqlPart1 += `INSERT INTO loans (
    id, client_id, route_id, collector_id,
    amount_requested, interest_rate, interest_amount, initial_obligation,
    term_days, daily_installment, frequency, 
    sundays_prepaid_count, sundays_prepaid_amount, receipt_fee, amount_delivered, current_balance,
    disbursement_date, start_date, end_date, grace_end_date, status, created_by
  ) VALUES \n${chunk.join(',\n')};\n\n`;
});
fs.writeFileSync(`e:/proyectos/cobradiario/supabase/migrations/999_mock_data_part1.sql`, sqlPart1);

// Escribir Cuotas en varias partes (aprox 2000 cuotas por archivo)
const instChunks = chunkArray(valuesInstallments, 100);
let sqlInst = '';
let partNum = 2;
let chunkCounter = 0;

instChunks.forEach(chunk => {
  sqlInst += `INSERT INTO loan_installments (
      id, loan_id, installment_number, scheduled_date, scheduled_amount,
      paid_amount, balance, status, day_type, is_prepaid, is_sunday, is_holiday
  ) VALUES \n${chunk.join(',\n')};\n\n`;
  
  chunkCounter++;
  
  // Guardar en archivo nuevo cada 20 chunks (2000 cuotas)
  if (chunkCounter >= 20) {
    fs.writeFileSync(`e:/proyectos/cobradiario/supabase/migrations/999_mock_data_part${partNum}.sql`, sqlInst);
    sqlInst = '';
    partNum++;
    chunkCounter = 0;
  }
});

// Guardar el remanente
if (sqlInst.length > 0) {
  fs.writeFileSync(`e:/proyectos/cobradiario/supabase/migrations/999_mock_data_part${partNum}.sql`, sqlInst);
}

// Limpiar el original para no confundir
try {
  fs.unlinkSync('e:/proyectos/cobradiario/supabase/migrations/999_mock_data.sql');
} catch(e) {}

console.log('Generados archivos divididos: 999_mock_data_part1 hasta part' + partNum);
