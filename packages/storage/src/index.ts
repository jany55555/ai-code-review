import type { ReviewFeedback, ReviewRun, ReviewStatus } from '@ai-code-review/contracts';

export class InMemoryStore {
  private readonly reviews = new Map<string, ReviewRun>();
  private readonly feedback = new Map<string, ReviewFeedback[]>();
  private readonly latestByRepo = new Map<string, string>();
  private readonly events = new Map<string, Array<{ status: ReviewStatus; at: string; errorMessage?: string }>>();

  saveReview(review: ReviewRun): void {
    this.reviews.set(review.id, review);
    this.latestByRepo.set(review.repository, review.id);
  }

  saveReviewEvent(reviewId: string, status: ReviewStatus, errorMessage?: string): void {
    const review = this.reviews.get(reviewId);
    if (!review) return;
    const list = this.events.get(reviewId) ?? [];
    list.push({ status, at: new Date().toISOString(), errorMessage });
    this.events.set(reviewId, list);
    this.reviews.set(reviewId, { ...review, status, updatedAt: new Date().toISOString(), errorMessage });
  }

  getReview(id: string): ReviewRun | undefined {
    return this.reviews.get(id);
  }

  getReviewByPR(repo: string, pr: number): ReviewRun | undefined {
    return [...this.reviews.values()].find((r) => r.repository === repo && r.pullRequestNumber === pr);
  }

  getLatestReviewByRepo(repo: string): ReviewRun | undefined {
    const id = this.latestByRepo.get(repo);
    return id ? this.reviews.get(id) : undefined;
  }

  getLatestReview(): ReviewRun | undefined {
    const values = [...this.reviews.values()];
    if (values.length === 0) return undefined;
    return values[values.length - 1];
  }

  listReviewEvents(reviewId: string): Array<{ status: ReviewStatus; at: string; errorMessage?: string }> {
    return this.events.get(reviewId) ?? [];
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
