import { skipToken } from '@reduxjs/toolkit/query/react'
import {
  ArrowLeftRight,
  Download,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react-native'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SectionList, StyleSheet, View } from 'react-native'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetAccountsQuery } from '@/features/accounts/api'
import { useUid } from '@/features/auth/hooks'
import { useGetCategoriesQuery } from '@/features/categories/api'
import { useLazyExportTransactionsQuery } from '@/features/data/api'
import { exportFileName, transactionsToCsv } from '@/features/data/csvExport'
import { useUserSettings } from '@/features/settings/hooks'
import {
  useGetTransactionsInfiniteQuery,
  useRecategorizeTransactionsMutation,
} from '@/features/transactions/api'
import { scheduleDelete } from '@/features/transactions/deleteFlow'
import {
  DEFAULT_FILTERS,
  SORTS,
  SORT_LABELS,
  activeFilterCount,
  buildQuery,
  type SortOrder,
} from '@/features/transactions/filters'
import { loadPrefs } from '@/features/transactions/prefs'
import { selectHiddenIds } from '@/features/transactions/slice'
import type { Transaction } from '@/features/transactions/types'
import { groupByDay } from '@/features/transactions/utils'
import { useToast } from '@/features/ui/hooks'
import { dialogOpened } from '@/features/ui/slice'
import { addCalendarDays, calendarDate } from '@/utils/dates'
import { downloadFile } from '@/utils/download'
import { formatMoney } from '@/utils/money'
import { listPadding } from '@m/components/Screen'
import { Button, IconButton } from '@m/components/ui/Button'
import { TextField } from '@m/components/ui/Field'
import { EmptyState, ErrorState, ListSkeleton } from '@m/components/ui/ListStates'
import { SelectField } from '@m/components/ui/Select'
import { Text } from '@m/components/ui/Text'
import { radius } from '@m/theme/colors'
import { useColors } from '@m/theme/ThemeProvider'
import { ActiveFilters } from './ActiveFilters'
import { FilterTotals } from './FilterTotals'
import { FiltersSheet } from './FiltersSheet'
import { RecategorizeDialog } from './RecategorizeDialog'
import { TransactionRow } from './TransactionRow'
import { useTransactionFilters } from './useTransactionFilters'

/** "Today", "Yesterday", or a locale date like "Fri, 2 Oct 2026". */
export function dayLabel(key: string, locale?: string, now = new Date()): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  const today = new Date(now)
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

interface Section {
  key: string
  title: string | null
  net: number | null
  data: Transaction[]
}

export function TransactionsScreen() {
  const uid = useUid()
  const c = useColors()
  const dispatch = useAppDispatch()
  const toast = useToast()
  const { baseCurrency, locale } = useUserSettings()
  const accountsQuery = useGetAccountsQuery(uid)
  const categoriesQuery = useGetCategoriesQuery(uid)
  const [filters, setFilters] = useTransactionFilters()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [recategorizeOpen, setRecategorizeOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [recategorize] = useRecategorizeTransactionsMutation()
  const hidden = useAppSelector(selectHiddenIds)
  const [fetchForExport, exportState] = useLazyExportTransactionsQuery()

  // Search box: typed text goes to the filters after a short pause.
  const [searchText, setSearchText] = useState(filters.search)
  const [lastSearch, setLastSearch] = useState(filters.search)
  if (filters.search !== lastSearch) {
    setLastSearch(filters.search)
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
  const categoriesById = useMemo(() => new Map(categories.map((x) => [x.id, x])), [categories])
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
        ...categories.filter((x) => x.parentId === id).map((x) => x.id),
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
  const sections = useMemo<Section[]>(() => {
    if (!byDate) return items.length ? [{ key: 'all', title: null, net: null, data: items }] : []
    return groupByDay(items).map((g) => ({
      key: g.key,
      title: dayLabel(g.key, locale),
      net: g.net,
      data: g.items,
    }))
  }, [byDate, items, locale])

  // Selection only keeps rows that are still listed, and resets when the filters change.
  const selectedItems = items.filter((t) => selected.has(t.id))
  const filterKey = JSON.stringify(query)
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setSelected(new Set())
  }
  const selecting = selectedItems.length > 0

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

  async function exportCsv() {
    const result = await fetchForExport({ uid, query })
    if (result.error || !result.data) {
      toast({
        title: 'Could not export',
        description: String(result.error ?? 'Try again.'),
        variant: 'error',
      })
      return
    }
    const rows = result.data.filter((t) => !hidden.has(t.id))
    const csv = transactionsToCsv(rows, { accounts: accountsById, categories, baseCurrency })
    const from = query.start ? calendarDate(query.start) : null
    const to = query.end ? addCalendarDays(calendarDate(query.end), -1) : null
    try {
      await downloadFile(`﻿${csv}`, exportFileName('transactions', from, to, 'csv'), 'text/csv')
      toast({
        title: `Exported ${rows.length} transaction${rows.length === 1 ? '' : 's'}`,
        variant: 'success',
      })
    } catch {
      toast({ title: 'Could not save the file', variant: 'error' })
    }
  }

  const filterCount = activeFilterCount(filters)
  const hasFilters = filterCount > 0 || filters.search.trim() !== ''
  const openQuickAdd = () => dispatch(dialogOpened({ kind: 'quick-add' }))
  const allSelected = items.length > 0 && selectedItems.length === items.length

  const header = (
    <View style={styles.header}>
      <TextField
        placeholder="Search payee or note"
        accessibilityLabel="Search payee or note"
        value={searchText}
        onChangeText={setSearchText}
        returnKeyType="search"
        right={<Search size={18} color={c.mutedForeground} />}
      />
      <View style={styles.toolbar}>
        <View style={styles.flex}>
          <SelectField
            title="Sort"
            value={filters.sort}
            onChange={(sort: SortOrder) => setFilters({ ...filters, sort })}
            options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
          />
        </View>
        <Button
          title={filterCount ? `Filters (${filterCount})` : 'Filters'}
          accessibilityLabel={filterCount ? `Filters, ${filterCount} active` : 'Filters'}
          icon={SlidersHorizontal}
          variant="outline"
          onPress={() => setFiltersOpen(true)}
        />
        <IconButton
          icon={Download}
          label={exportState.isFetching ? 'Exporting' : 'Export CSV'}
          disabled={exportState.isFetching || waitForCategories}
          onPress={() => void exportCsv()}
        />
      </View>
      <ActiveFilters
        filters={filters}
        onChange={setFilters}
        accounts={accountsById}
        categories={categoriesById}
        baseCurrency={baseCurrency}
        locale={locale}
      />
      {!waitForCategories ? (
        <FilterTotals
          uid={uid}
          query={query}
          loaded={items}
          complete={Boolean(list.data) && !hasNextPage}
          baseCurrency={baseCurrency}
          locale={locale}
        />
      ) : null}
    </View>
  )

  const empty =
    list.isLoading || waitForCategories ? (
      <ListSkeleton rows={6} label="Loading transactions" />
    ) : list.isError ? (
      <ErrorState
        title="Could not load your transactions"
        message={String(list.error)}
        onRetry={() => void list.refetch()}
      />
    ) : hasNextPage ? null : hasFilters ? (
      <EmptyState
        icon={Search}
        title="No transactions match"
        description="Try a wider date range or fewer filters."
        action={
          <Button
            title="Clear filters"
            variant="outline"
            onPress={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
          />
        }
      />
    ) : (
      <EmptyState
        icon={ArrowLeftRight}
        title="No transactions yet"
        description="Add your first expense, income or transfer."
        action={<Button title="Add transaction" icon={Plus} onPress={openQuickAdd} />}
      />
    )

  const footer =
    items.length === 0 ? null : (
      <View style={styles.footer}>
        {list.isError ? (
          <ErrorState
            title="Could not load more"
            message={String(list.error)}
            onRetry={() => void fetchNextPage()}
          />
        ) : hasNextPage ? (
          <Button
            title={isFetchingNextPage ? 'Loading more…' : 'Load more'}
            variant="ghost"
            disabled={isFetchingNextPage}
            onPress={() => void fetchNextPage()}
          />
        ) : (
          <Text variant="small" tone="muted">
            {hasFilters
              ? `${items.length} match${items.length === 1 ? '' : 'es'}`
              : `${items.length} transaction${items.length === 1 ? '' : 's'}`}
          </Text>
        )}
      </View>
    )

  return (
    <View style={[styles.flex, { backgroundColor: c.background }]}>
      {selecting ? (
        <View
          accessibilityLabel="Bulk actions"
          style={[styles.bulk, { backgroundColor: c.card, borderColor: c.border }]}
        >
          <View style={styles.bulkRow}>
            <IconButton icon={X} label="Clear selection" onPress={() => setSelected(new Set())} />
            <Text weight="600" accessibilityLiveRegion="polite" style={styles.flex}>
              {selectedItems.length} selected
            </Text>
            <Button
              size="sm"
              variant="ghost"
              title={allSelected ? 'Select none' : `Select all ${items.length}`}
              onPress={() => setSelected(allSelected ? new Set() : new Set(items.map((t) => t.id)))}
            />
          </View>
          <View style={styles.bulkRow}>
            <Button
              size="sm"
              variant="outline"
              icon={Tag}
              title="Change category"
              disabled={!recategorizeKind}
              onPress={() => setRecategorizeOpen(true)}
            />
            <Button
              size="sm"
              variant="destructive"
              icon={Trash2}
              title="Delete"
              onPress={bulkDelete}
            />
          </View>
          {!recategorizeKind ? (
            <Text variant="caption" tone="muted">
              To change the category, select only expenses or only income.
            </Text>
          ) : null}
        </View>
      ) : null}
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        contentContainerStyle={listPadding}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetching) void fetchNextPage()
        }}
        refreshing={false}
        onRefresh={() => void list.refetch()}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={styles.dayHeader} accessibilityRole="header">
              <Text variant="small" weight="600">
                {section.title}
              </Text>
              {section.net !== null ? (
                <Text
                  variant="small"
                  tone={section.net > 0 ? 'success' : 'muted'}
                  tabular
                  accessibilityLabel={`Day total ${formatMoney(section.net, baseCurrency, locale)}`}
                >
                  {formatMoney(section.net, baseCurrency, locale, {
                    signDisplay: section.net === 0 ? 'auto' : 'always',
                  })}
                </Text>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <TransactionRow
              tx={item}
              accounts={accountsById}
              categories={categoriesById}
              baseCurrency={baseCurrency}
              locale={locale}
              selected={selected.has(item.id)}
              selecting={selecting}
              onToggleSelected={toggleSelected}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          </View>
        )}
      />
      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onApply={setFilters}
        accounts={accounts}
        categories={categories}
        knownTags={knownTags}
        baseCurrency={baseCurrency}
      />
      {recategorizeKind && recategorizeOpen ? (
        <RecategorizeDialog
          open
          onClose={() => setRecategorizeOpen(false)}
          count={selectedItems.length}
          kind={recategorizeKind}
          categories={categories}
          onApply={applyCategory}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: 12, marginBottom: 4 },
  toolbar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 8,
  },
  item: { marginBottom: 8 },
  footer: { alignItems: 'center', paddingVertical: 12 },
  bulk: { borderBottomWidth: 1, padding: 8, gap: 6, borderRadius: radius.sm },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
})
