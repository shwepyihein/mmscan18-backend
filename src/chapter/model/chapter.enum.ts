export enum ChapterStatus {
  // Initial state - chapter crawled with English OCR text (en.json)
  RAW = 'RAW',

  // Image cleaning / inpainting in progress (text removal)
  CLEANING = 'CLEANING',

  // Contributor is working on translation
  IN_PROGRESS = 'IN_PROGRESS',

  // Contributor has submitted translation for review
  IN_REVIEW = 'IN_REVIEW',

  // Translation completed and reviewed
  TRANSLATED = 'TRANSLATED',

  PUBLISHED = 'PUBLISHED',
}
