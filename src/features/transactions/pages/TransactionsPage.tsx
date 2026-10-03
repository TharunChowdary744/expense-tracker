import { skipToken } from '@reduxjs/toolkit/query/react'
import { ArrowLeftRight, Plus, Search, SlidersHorizontal, Tag, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ListStates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useUserSettings } from '@/features/settings/hooks'
import { useToast } from '@/features/ui/hooks'
import { dialogOpened } from '@/features/ui/slice'
import { formatMoney } from '@/utils/money'
import { useGetTransactionsInfiniteQuery, useRecategorizeTransactionsMutation } from '../api'
import { ActiveFilters } from '../components/ActiveFilters'
import { FiltersSheet } from '../components/FiltersSheet'
import { RecategorizeDialog } from '../components/RecategorizeDialog'
import { TransactionRow } from '../components/TransactionRow'
import { scheduleDelete } from '../deleteFlow'
import {
  DEFAULT_FILTERS,
  SORTS,
  SORT_LABELS,
  activeFilterCount,
  buildQuery,
  type SortOrder,
} from '../filters'
import { useInView } from '../hooks/useInView'
import { useTransactionFilters } from '../hooks/useTransactionFilters'
import { loadPrefs } from '../prefs'
import { selectHiddenIds } from '../slice'
import type { Transaction } from '../types'
import { groupByDay } from '../utils'

export function TransactionsPage() {
  const uid = useUid()
  const dispatch = useAppDispatch()
  const toast = useToast()
  const searchId = useId()
  const sortId = useId()
  const { baseCurrency, locale } = useUserSettings()
  const accountsQuery = useGetAccountsQuery(uid)
  const categoriesQuery = useGetCategoriesQuery(uid)
  const [filters, setFilters] = useTransactionFilters()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [recategorizeOpen, setRecategorizeOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [recategorize] = useRecategorizeTransactionsMutation()
  const hidden = useAppSelector(selectHiddenIds)

  // Search box: typed text goes to the URL after a short pause.
  const [searchText, setSearchText] = useState(filters.search)
  const [lastUrlSearch, setLastUrlSearch] = useState(filters.search)
  if (filters.search !== lastUrlSearch) {
    setLastUrlSearch(filters.search)
    setSearchText(filters.search)
  }
  useEffect(() => {
    if (searchText.trim() === filters.search.trim()) return
    const timer = setTimeout(() => setFilters({ ...filters, search: searchText }), 300)
    return () => clearTimeout(timer)
  }, [searchText, filters, setFilters])

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const currencies = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.currency])),
    [accounts],
  )

  // Category filters include subcategories, so wait for categories when one is set.
  const waitForCategories = filters.categoryIds.length > 0 && !categoriesQuery.data
  const query = useMemo(
    () =>
      buildQuery(filters, baseCurrency, (id) => [
        id,
        ...categories.filter((c) => c.parentId === id).map((c) => c.id),
      ]),
    [filters, baseCurrency, categories],
  )
  const list = useGetTransactionsInfiniteQuery(waitForCategories ? skipToken : { uid, query })
  const { hasNextPage, isFetchingNextPage, isFetching, fetchNextPage } = list

  const items = useMemo(
    () => (list.data?.pages ?? []).flatMap((p) => p.items).filter((t) => !hidden.has(t.id)),
    [list.data, hidden],
  )
  const byDate = filters.sort.startsWith('date')
  const groups = useMemo(() => (byDate ? groupByDay(items) : null), [byDate, items])

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const nearEnd = useInView(sentinel)
  useEffect(() => {
    if (nearEnd && hasNextPage && !isFetching) void fetchNextPage()
  }, [nearEnd, hasNextPage, isFetching, fetchNextPage])

  // Selection only keeps rows that are still listed.
  const selectedItems = items.filter((t) => selected.has(t.id))
  const filterKey = JSON.stringify(query)
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setSelected(new Set())
  }

  const knownTags = useMemo(
    () => [...new Set([...loadPrefs(uid).knownTags, ...items.flatMap((t) => t.tags)])].sort(),
    [uid, items],
  )

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const onEdit = useCallback(
    (transaction: Transaction) => dispatch(dialogOpened({ kind: 'edit-transaction', transaction })),
    [dispatch],
  )
  const onDuplicate = useCallback(
    (transaction: Transaction) =>
      dispatch(dialogOpened({ kind: 'edit-transaction', transaction, duplicate: true })),
    [dispatch],
  )
  const onDelete = useCallback(
    (transaction: Transaction) =>
      dispatch(scheduleDelete({ uid, transactions: [transaction], currencies })),
    [dispatch, uid, currencies],
  )

  function bulkDelete() {
    dispatch(scheduleDelete({ uid, transactions: selectedItems, currencies }))
    setSelected(new Set())
  }

  const selectedKinds = new Set(selectedItems.map((t) => t.type))
  const recategorizeKind =
    selectedKinds.size === 1 && !selectedKinds.has('transfer')
      ? (selectedItems[0]?.type as 'expense' | 'income')
      : null

  async function applyCategory(categoryId: string | null): Promise<string | null> {
    const result = await recategorize({ uid, ids: selectedItems.map((t) => t.id), categoryId })
    if ('error' in result) return String(result.error)
    toast({
      title: `Category changed for ${selectedItems.length} transaction${selectedItems.length === 1 ? '' : 's'}`,
      variant: 'success',
    })
    setRecategorizeOpen(false)
    setSelected(new Set())
    return null
  }

  const filterCount = activeFilterCount(filters)
  const hasFilters = filterCount > 0 || filters.search.trim() !== ''
  const openQuickAdd = () => dispatch(dialogOpened({ kind: 'quick-add' }))
  const allSelected = items.length > 0 && selectedItems.length === items.length

  const renderRow = (tx: Transaction) => (
    <TransactionRow
      key={tx.id}
      tx={tx}
      accounts={accountsById}
      categories={categoriesById}
      baseCurrency={baseCurrency}
      locale={locale}
      selected={selected.has(tx.id)}
      onToggleSelected={toggleSelected}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <Button onClick={openQuickAdd}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-48 flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search payee or note
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Search payee or note"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-9"
          />
        </div>
        <label htmlFor={sortId} className="sr-only">
          Sort
        </label>
        <select
          id={sortId}
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortOrder })}
          className="h-9 rounded-md border bg-background px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal aria-hidden />
          Filters
          {filterCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              <span className="sr-only">(</span>
              {filterCount}
              <span className="sr-only"> active)</span>
            </span>
          )}
        </Button>
      </div>

      <ActiveFilters
        filters={filters}
        onChange={setFilters}
        accounts={accountsById}
        categories={categoriesById}
        baseCurrency={baseCurrency}
        locale={locale}
      />

      {selectedItems.length > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm"
        >
          <span className="px-2 text-sm font-medium" aria-live="polite">
            {selectedItems.length} selected
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((t) => t.id)))}
          >
            {allSelected ? 'Select none' : `Select all ${items.length}`}
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!recategorizeKind}
              title={
                recategorizeKind
                  ? undefined
                  : 'Select only expenses or only income to change their category'
              }
              onClick={() => setRecategorizeOpen(true)}
            >
              <Tag aria-hidden />
              Change category
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              <Trash2 aria-hidden />
              Delete
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="Clear selection"
              onClick={() => setSelected(new Set())}
            >
              <X />
            </Button>
          </div>
          {!recategorizeKind && (
            <p className="w-full px-2 text-xs text-muted-foreground">
              To change the category, select only expenses or only income.
            </p>
          )}
        </div>
      )}

      {list.isLoading || waitForCategories ? (
        <ListSkeleton rows={6} label="Loading transactions" />
      ) : list.isError && items.length === 0 ? (
        <ErrorState
          title="Could not load your transactions"
          message={String(list.error)}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 && !hasNextPage ? (
        hasFilters ? (
          <EmptyState
            icon={Search}
            title="No transactions match"
            description="Try a wider date range or fewer filters."
            action={
              <Button
                variant="outline"
                onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transactions yet"
            description="Add your first expense, income or transfer. Press N on a keyboard."
            action={
              <Button onClick={openQuickAdd}>
                <Plus aria-hidden />
                Add transaction
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-5">
          {groups ? (
            groups.map((group) => (
              <section key={group.key} aria-labelledby={`day-${group.key}`} className="space-y-2">
                <header className="flex items-baseline justify-between px-1">
                  <h2 id={`day-${group.key}`} className="text-sm font-semibold">
                    {dayLabel(group.key, locale)}
                  </h2>
                  <span
                    className={`text-sm tabular-nums ${group.net > 0 ? 'text-success' : 'text-muted-foreground'}`}
                  >
                    <span className="sr-only">Day total </span>
                    {formatMoney(group.net, baseCurrency, locale, {
                      signDisplay: group.net === 0 ? 'auto' : 'always',
                    })}
                  </span>
                </header>
                <ul className="space-y-2" aria-labelledby={`day-${group.key}`}>
                  {group.items.map(renderRow)}
                </ul>
              </section>
            ))
          ) : (
            <ul className="space-y-2" aria-label="Transactions">
              {items.map(renderRow)}
            </ul>
          )}

          <div ref={setSentinel} className="flex flex-col items-center gap-2 py-2">
            {list.isError && items.length > 0 ? (
              <ErrorState
                title="Could not load more"
                message={String(list.error)}
                onRetry={() => void fetchNextPage()}
              />
            ) : hasNextPage ? (
              <Button
                variant="ghost"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {hasFilters
                  ? `${items.length} match${items.length === 1 ? '' : 'es'}`
                  : `${items.length} transaction${items.length === 1 ? '' : 's'}`}
              </p>
            )}
          </div>
        </div>
      )}

      <FiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onApply={setFilters}
        accounts={accounts}
        categories={categories}
        knownTags={knownTags}
        baseCurrency={baseCurrency}
      />
      {recategorizeKind && (
        <RecategorizeDialog
          open={recategorizeOpen}
          onOpenChange={setRecategorizeOpen}
          count={selectedItems.length}
          kind={recategorizeKind}
          categories={categories}
          onApply={applyCategory}
        />
      )}
    </section>
  )
}

/** "Today", "Yesterday", or a locale date like "Fri, 2 Oct 2026". */
function dayLabel(key: string, locale?: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date)
}
