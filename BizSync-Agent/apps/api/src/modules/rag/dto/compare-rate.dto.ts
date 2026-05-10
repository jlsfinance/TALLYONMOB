export interface CompareRateRequestDto {
  itemName: string;
  fileNames: string[];
}

export interface FileItemRate {
  fileName: string;
  itemName: string;
  rate: number;
  currency: string;
}
