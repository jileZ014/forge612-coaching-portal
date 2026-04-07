import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    // Find header row
    const headers = rawData[0] as string[];
    
    // Map column indices
    const colMap: Record<string, number> = {};
    headers.forEach((h, idx) => {
      const header = String(h || '').toLowerCase().trim();
      if (header.includes('player')) colMap.playerName = idx;
      if (header.includes('parent') && header.includes('first')) colMap.parentFirst = idx;
      if (header.includes('parent') && header.includes('last')) colMap.parentLast = idx;
      if (header === 'team') colMap.team = idx;
      if (header.includes('email')) colMap.email = idx;
      if (header.includes('phone')) colMap.phone = idx;
      if (header === 'cost') colMap.cost = idx;
      if (header === 'notes') colMap.notes = idx;
    });

    // Find December column (Dec.1 or last Dec column)
    headers.forEach((h, idx) => {
      const header = String(h || '').toLowerCase().trim();
      if (header === 'dec.1' || header === 'dec' || header.includes('dec')) {
        colMap.december = idx;
      }
    });

    // Parse rows
    const rows = [];
    
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      const playerName = row[colMap.playerName];
      
      // Skip empty rows
      if (!playerName) continue;
      
      const notes = String(row[colMap.notes] || '').toLowerCase();
      const doNotInvoice = notes.includes('do not send') || notes.includes('dont send');
      
      // Get December balance
      let currentBalance = 0;
      const decValue = row[colMap.december];
      
      if (decValue === 'Paid' || decValue === 'paid') {
        currentBalance = 0;
      } else if (typeof decValue === 'number' && !isNaN(decValue)) {
        currentBalance = decValue;
      }
      
      // Check if coach (cost = 0 or specific pattern)
      const cost = parseFloat(row[colMap.cost]) || 0;
      const isCoach = cost === 0 && !doNotInvoice && notes.includes('coach');
      
      rows.push({
        playerName: String(playerName),
        parentFirst: String(row[colMap.parentFirst] || ''),
        parentLast: String(row[colMap.parentLast] || ''),
        team: String(row[colMap.team] || ''),
        email: String(row[colMap.email] || ''),
        phone: String(row[colMap.phone] || '').replace(/[^0-9]/g, ''),
        cost: cost,
        notes: String(row[colMap.notes] || ''),
        currentBalance,
        isCoach,
        doNotInvoice,
      });
    }

    return NextResponse.json({ rows, headers: Object.keys(colMap) });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 });
  }
}
