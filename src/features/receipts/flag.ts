/**
 * Build-time switch for the receipts feature. Off unless VITE_RECEIPTS_ENABLED is "true":
 * attach buttons, receipt counts and the upload/delete queue are hidden or idle, and saved
 * attachment data is left untouched so turning it back on restores everything.
 */
export const receiptsEnabled = import.meta.env.VITE_RECEIPTS_ENABLED === 'true'
