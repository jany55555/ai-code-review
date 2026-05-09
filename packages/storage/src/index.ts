import type { ReviewFeedback, ReviewRun } from '@ai-code-review/contracts';

export class InMemoryStore {
  private readonly reviews = new Map<string, ReviewRun>();
  private readonly feedback = new Map<string, ReviewFeedback[]>();

  saveReview(review: ReviewRun): void {
    this.reviews.set(review.id, review);
  }

  getReview(id: string): ReviewRun | undefined {
    return this.reviews.get(id);
  }

  getReviewByPR(repo: string, pr: number): ReviewRun | undefined {
    return [...this.reviews.values()].find((r) => r.repository === repo && r.pullRequestNumber === pr);
  }

  saveFeedback(item: ReviewFeedback): void {
    const list = this.feedback.get(item.reviewId) ?? [];
    list.push(item);
    this.feedback.set(item.reviewId, list);
  }

  listFeedback(reviewId: string): ReviewFeedback[] {
    return this.feedback.get(reviewId) ?? [];
  }
}
