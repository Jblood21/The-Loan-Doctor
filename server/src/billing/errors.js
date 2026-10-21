/** An expected billing problem with a message safe to show the user. */
export class BillingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
