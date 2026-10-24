/**
 * eligibility.ts — per-item return eligibility with an outcome preview.
 *
 * The preview is the point: bundle effects, free-gift effects and
 * window effects are shown as explicit policy lines BEFORE the return
 * is confirmed, never discovered after the money moves.
 * A seller exception is an approved, seller-granted exception: when
 * present it overrides a window expiry (it does not resurrect a free
 * gift's refund value — a gift's effective price is ₹0 by definition).
 */
export interface EligibilityInput {
  category: string;
  daysSinceDelivery: number;
  returnWindowDays: number;
  /** Customer-declared condition, e.g. 'unused' | 'opened' | 'used' | 'damaged'. */
  conditionDeclared: string;
  /** True when this item was a free gift in the order. */
  isFreeGift: boolean;
  /** True when this item belongs to a priced bundle. */
  qualifiesBundle: boolean;
  /** Approved seller exception note, when one was granted. */
  sellerException?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  previewLines: string[];
}

/** Categories that are never returnable on this platform (policy list). */
export const NON_RETURNABLE_CATEGORIES: readonly string[] = [
  'hygiene',
  'personal_care',
  'perishable',
  'intimate',
  'final_sale',
];

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  const previewLines: string[] = [];
  let eligible = true;

  const hasSellerException = typeof input.sellerException === 'string' && input.sellerException.trim().length > 0;
  const categoryBlocked = NON_RETURNABLE_CATEGORIES.includes(input.category.trim().toLowerCase());
  const outsideWindow = input.daysSinceDelivery > input.returnWindowDays;

  // Free gift: returnable to restore stock, but it carries ₹0 of
  // refundable value — and if the qualifying item is returned, the
  // gift must come back too or its listed value is clawed back.
  if (input.isFreeGift) {
    eligible = false;
    reasons.push('This item was a free gift: its effective price is ₹0, so there is no refund to issue for it.');
    previewLines.push(
      'Free gift: returning it alone refunds ₹0. If the item that qualified you for this gift is returned, the gift must be returned as well — a kept gift is charged at its listed value against that refund (clawback).',
    );
    return { eligible, reasons, previewLines };
  }

  if (categoryBlocked) {
    eligible = false;
    reasons.push(`Category "${input.category}" is non-returnable on this platform.`);
    previewLines.push(`Category policy: "${input.category}" items cannot be returned.`);
  }

  if (outsideWindow) {
    if (hasSellerException) {
      reasons.push(
        `Outside the ${input.returnWindowDays}-day return window (${input.daysSinceDelivery} days since delivery), but a seller exception overrides the window.`,
      );
      previewLines.push(
        `Seller exception applied: "${input.sellerException}" — the expired return window is overridden for this item.`,
      );
    } else {
      eligible = false;
      reasons.push(
        `Return window expired: ${input.daysSinceDelivery} days since delivery exceeds the ${input.returnWindowDays}-day window.`,
      );
      previewLines.push(
        `Window: delivered ${input.daysSinceDelivery} days ago; the ${input.returnWindowDays}-day return window has closed, so this item cannot be returned.`,
      );
    }
  } else {
    reasons.push(
      `Within the return window: ${input.daysSinceDelivery} of ${input.returnWindowDays} days used.`,
    );
    previewLines.push(
      `Window: ${input.returnWindowDays - input.daysSinceDelivery} day(s) left in the return window.`,
    );
  }

  if (hasSellerException && !outsideWindow) {
    previewLines.push(`Seller exception on record: "${input.sellerException}".`);
    reasons.push(`Seller exception noted: "${input.sellerException}".`);
  }

  if (input.qualifiesBundle) {
    previewLines.push(
      'Bundle: this item is part of a priced bundle. Returning it refunds only its allocated share of the bundle price; if the bundle terms break, kept components reprice to their standalone prices and the difference is shown before you confirm.',
    );
    reasons.push('Item belongs to a bundle — bundle repricing rules apply to kept components.');
  }

  const condition = input.conditionDeclared.trim().toLowerCase();
  if (condition === 'used' || condition === 'damaged' || condition === 'opened') {
    previewLines.push(
      `Condition declared "${input.conditionDeclared}": the item will be inspected; a confirmed condition deduction follows the published tiers (opened/late up to 20%, minor damage up to 25%, used up to 50%) and always requires photo proof. Declared condition alone never reduces the refund.`,
    );
  } else {
    previewLines.push(
      `Condition declared "${input.conditionDeclared}": standard inspection applies; a full refund of the item's effective price is expected if inspection agrees.`,
    );
  }

  if (eligible) {
    previewLines.push(
      `Refund preview: a full refund returns this item's effective price (list price minus its coupon share — the coupon share itself is not refundable cash).`,
    );
  }

  return { eligible, reasons, previewLines };
}
