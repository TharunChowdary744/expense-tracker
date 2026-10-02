import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

/**
 * The single RTK Query api. All Firestore access goes through endpoints injected from
 * features (`api.injectEndpoints`) using `queryFn`; components never call Firestore directly.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: [
    'User',
    'Account',
    'Category',
    'Transaction',
    'Budget',
    'Recurring',
    'Notification',
    'Group',
    'GroupExpense',
    'Settlement',
  ],
  endpoints: () => ({}),
})
