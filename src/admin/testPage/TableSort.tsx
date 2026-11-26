import { useState } from 'react';
import { t } from '../../i18n/t.ts';
import { nextSort, parseSort, saveSort, savedSort, sortValue, type SortKey, type SortTable, type TableSort } from './tableSort.ts';

// The chosen order of one of the students' tables, kept in this browser.
export function useTableSort(table: SortTable): [TableSort, (sort: TableSort) => void] {
  const [sort, setSort] = useState(() => savedSort(table));
  const choose = (next: TableSort) => {
    setSort(next);
    saveSort(table, next);
  };
  return [sort, choose];
}

// A column's name that sorts the table: a click sorts by it, a second click
// the other way. The sorted column has an arrow and `aria-sort`; the others a
// faint double arrow. On a phone the table is a column of cards whose column
// names are hidden, so they are plain text there (`cards`), and the order is
// chosen in `SortSelect` instead.
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  cards,
}: {
  label: string;
  sortKey: SortKey;
  sort: TableSort;
  onSort: (sort: TableSort) => void;
  cards: boolean;
}) {
  const on = sort.key === sortKey;
  const ariaSort = on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
  if (cards) {
    return (
      <th scope="col" aria-sort={ariaSort}>
        {label}
      </th>
    );
  }
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className={on ? 'sort-button is-on' : 'sort-button'} onClick={() => onSort(nextSort(sort, sortKey))}>
        {label}
        <svg className="sort-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path
            d={!on ? 'M5 6l3-3 3 3M5 10l3 3 3-3' : sort.dir === 'asc' ? 'M8 13V3M4 7l4-4 4 4' : 'M8 3v10M4 9l4 4 4-4'}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </th>
  );
}

// The orders a phone offers for each table, the names A to Z first.
function choices(table: SortTable): [string, string][] {
  if (table === 'results') {
    return [
      ['name-asc', t('Nume (A–Z)')],
      ['name-desc', t('Nume (Z–A)')],
      ['grade-desc', t('Nota (mare → mică)')],
      ['grade-asc', t('Nota (mică → mare)')],
      ['points-desc', t('Punctaj (mare → mic)')],
      ['published-desc', t('Publicate întâi')],
    ];
  }
  return [
    ['name-asc', t('Nume (A–Z)')],
    ['name-desc', t('Nume (Z–A)')],
    ['grade-desc', t('Nota (mare → mică)')],
    ['grade-asc', t('Nota (mică → mare)')],
    ['state-asc', t('Stare')],
    ['time-asc', t('Ora trimiterii')],
    ['check-desc', t('De verificat (multe → puține)')],
    ['files-desc', t('Fișiere (multe → puține)')],
  ];
}

// "Ordine" above the cards of a phone. An order picked on a computer that
// the list does not offer (a column sorted the other way) shows as its
// column's name with an arrow.
export function SortSelect({
  table,
  sort,
  onSort,
  columns,
}: {
  table: SortTable;
  sort: TableSort;
  onSort: (sort: TableSort) => void;
  columns: Partial<Record<SortKey, string>>;
}) {
  const options = choices(table);
  const value = sortValue(sort);
  if (!options.some(([option]) => option === value)) options.push([value, `${columns[sort.key] ?? ''} ${sort.dir === 'asc' ? '↑' : '↓'}`]);
  return (
    <label className="table-sort">
      {t('Ordine')}
      <select
        value={value}
        onChange={(event) => {
          const next = parseSort(table, event.target.value);
          if (next) onSort(next);
        }}
      >
        {options.map(([option, label]) => (
          <option key={option} value={option}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
