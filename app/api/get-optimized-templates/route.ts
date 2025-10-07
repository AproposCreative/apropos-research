import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(request: NextRequest) {
  try {
    const templatesFile = path.join(process.cwd(), 'data', 'optimized-templates.json');
    
    if (!fs.existsSync(templatesFile)) {
      return NextResponse.json(
        { error: 'Optimized templates not found' },
        { status: 404 }
      );
    }

    const templatesData = fs.readFileSync(templatesFile, 'utf8');
    const templates = JSON.parse(templatesData);

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error loading optimized templates:', error);
    return NextResponse.json(
      { error: 'Failed to load optimized templates' },
      { status: 500 }
    );
  }
}
