'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
  type RowClassRules,
  type ValueFormatterParams,
} from 'ag-grid-community'
import { AgGridProvider, AgGridReact } from 'ag-grid-react'
import { Button } from '@/components/ui/button'
import { RISK_LEVELS } from '@/lib/domain'
import { formatCents } from '@/lib/money'
import { useCaregiver, type CaregiverPayment } from './caregiver-context'
import { caregiverStatus, RiskBadge, StatusBadge } from './risk-badge'

const modules = [AllCommunityModule]

// Matches the app's green palette.
const havenTheme = themeQuartz.withParams({
  accentColor: '#1f6b4f',
  backgroundColor: '#ffffff',
  foregroundColor: '#26352c',
  headerBackgroundColor: '#f5f9f5',
  headerTextColor: '#4c5d52',
  headerFontWeight: 600,
  borderColor: '#e7eee7',
  rowHoverColor: '#f1f8f2',
  oddRowBackgroundColor: '#fcfdfc',
  selectedRowBackgroundColor: '#e5f4e8',
  wrapperBorderRadius: 16,
  fontFamily: 'inherit',
  fontSize: 14,
  browserColorScheme: 'light',
})

type Row = CaregiverPayment

function ActionsCell({ data }: ICellRendererParams<Row>) {
  const { openApprove, openDecline } = useCaregiver()
  if (!data || data.status !== 'held') return null
  return (
    <div className="flex h-full items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" className="h-8 bg-[#b91c1c] px-3 hover:bg-[#991b1b]" onClick={() => openDecline(data)}>
        Decline
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 border-[#1f6b4f] px-3 text-[#1f6b4f]"
        onClick={() => openApprove(data)}
      >
        Approve
      </Button>
    </div>
  )
}

const rowClassRules: RowClassRules<Row> = {
  'haven-row-held-high': (p) => p.data?.status === 'held' && p.data?.riskLevel === 'high',
}

export function PaymentsTable({ search = '', pageSize = 10 }: { search?: string; pageSize?: number }) {
  const { payments, loadError, openDetail } = useCaregiver()

  const columnDefs = useMemo<ColDef<Row>[]>(
    () => [
      {
        headerName: 'Date / time',
        field: 'createdAt',
        sort: 'desc',
        minWidth: 160,
        valueFormatter: (p: ValueFormatterParams<Row, string>) =>
          p.value ? format(new Date(p.value), 'MMM d, h:mm a') : '',
        filter: 'agDateColumnFilter',
        filterValueGetter: (p) => (p.data ? new Date(p.data.createdAt) : null),
        getQuickFilterText: (p) => (p.value ? format(new Date(p.value), 'MMM d') : ''),
      },
      { headerName: 'Payee', field: 'payeeName', minWidth: 150, filter: 'agTextColumnFilter' },
      {
        headerName: 'Amount',
        field: 'amountCents',
        minWidth: 110,
        type: 'rightAligned',
        filter: 'agNumberColumnFilter',
        filterValueGetter: (p) => (p.data ? p.data.amountCents / 100 : null),
        valueFormatter: (p: ValueFormatterParams<Row, number>) => (p.value == null ? '' : formatCents(p.value)),
        getQuickFilterText: (p) => formatCents(p.value),
      },
      {
        headerName: 'Status',
        field: 'status',
        minWidth: 140,
        enableCellChangeFlash: true,
        cellRenderer: (p: ICellRendererParams<Row>) => (p.data ? <StatusBadge status={p.data.status} /> : null),
        filter: 'agTextColumnFilter',
        filterValueGetter: (p) => (p.data ? caregiverStatus[p.data.status].label : ''),
        getQuickFilterText: (p) => caregiverStatus[p.data!.status].label,
      },
      {
        headerName: 'Risk',
        field: 'riskLevel',
        minWidth: 120,
        cellRenderer: (p: ICellRendererParams<Row>) => (p.data ? <RiskBadge level={p.data.riskLevel} /> : null),
        comparator: (a: string, b: string) =>
          RISK_LEVELS.indexOf(a as (typeof RISK_LEVELS)[number]) -
          RISK_LEVELS.indexOf(b as (typeof RISK_LEVELS)[number]),
        filter: 'agTextColumnFilter',
      },
      {
        headerName: 'Reason',
        field: 'reason',
        flex: 1,
        minWidth: 260,
        tooltipField: 'reason',
        filter: 'agTextColumnFilter',
      },
      {
        headerName: '',
        colId: 'actions',
        minWidth: 190,
        maxWidth: 200,
        sortable: false,
        filter: false,
        resizable: false,
        cellRenderer: ActionsCell,
      },
    ],
    [],
  )

  if (loadError && !payments) {
    return <p className="p-6 text-sm text-[#b91c1c]">Couldn&apos;t load payments. Retrying...</p>
  }

  return (
    <AgGridProvider modules={modules}>
      <div className="w-full">
        <AgGridReact<Row>
          theme={havenTheme}
          rowData={payments ?? undefined}
          loading={!payments}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, floatingFilter: false }}
          getRowId={(p) => p.data.id}
          rowClassRules={rowClassRules}
          quickFilterText={search}
          onRowClicked={(e) => e.data && openDetail(e.data.id)}
          rowStyle={{ cursor: 'pointer' }}
          domLayout="autoHeight"
          pagination
          paginationPageSize={pageSize}
          paginationPageSizeSelector={[10, 25, 50]}
          tooltipShowDelay={400}
          overlayNoRowsTemplate="No payments yet."
        />
      </div>
    </AgGridProvider>
  )
}
