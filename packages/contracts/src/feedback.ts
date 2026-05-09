export type FeedbackState = 'accepted' | 'ignored' | 'needs_more_context';

export interface ReviewFeedback {
  reviewId: string;
  issueId: string;
  state: FeedbackState;
  note?: string;
  createdAt: string;
}
