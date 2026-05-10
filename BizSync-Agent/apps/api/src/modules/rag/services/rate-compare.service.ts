import { Injectable } from '@nestjs/common';
import { CompareRateRequestDto, FileItemRate } from '../dto/compare-rate.dto';

interface CatalogItem {
  itemName: string;
  rate: number;
  currency: string;
}

interface CatalogFile {
  fileName: string;
  items: CatalogItem[];
}

@Injectable()
export class RateCompareService {
  // Demo in-memory catalog. Replace with Postgres query on extracted rows in production.
  private readonly catalogFiles: CatalogFile[] = [
    {
      fileName: 'Bairathi',
      items: [
        { itemName: 'Apollo', rate: 120, currency: 'INR' },
        { itemName: 'UltraTech', rate: 118, currency: 'INR' }
      ]
    },
    {
      fileName: 'Topseries',
      items: [
        { itemName: 'Apollo', rate: 125, currency: 'INR' },
        { itemName: 'JK Cement', rate: 121, currency: 'INR' }
      ]
    }
  ];

  compareItemRates(payload: CompareRateRequestDto): { itemName: string; matches: FileItemRate[]; message: string } {
    const target = payload.itemName.trim().toLowerCase();
    const fileFilter = new Set(payload.fileNames.map((f) => f.trim().toLowerCase()));

    const matches: FileItemRate[] = [];

    for (const file of this.catalogFiles) {
      if (!fileFilter.has(file.fileName.toLowerCase())) {
        continue;
      }
      for (const item of file.items) {
        if (item.itemName.toLowerCase() === target) {
          matches.push({ fileName: file.fileName, itemName: item.itemName, rate: item.rate, currency: item.currency });
        }
      }
    }

    const message = matches.length
      ? matches.map((m) => `${m.fileName} ${m.itemName} Rs ${m.rate}`).join(', ')
      : `${payload.itemName} ka rate selected files me nahi mila.`;

    return { itemName: payload.itemName, matches, message };
  }
}
