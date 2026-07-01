export interface DeadLetterRecord {
  id: string;
  jobId: string;
  reason: string | null;
  createdAt: string;
}

export interface DeadLetterPage {
  items: DeadLetterRecord[];
  nextCursor: string | null;
}

export interface DeadLetterCursor {
  createdAt: string;
  id: string;
}
