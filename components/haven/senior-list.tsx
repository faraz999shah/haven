import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const contacts = [
  { name: 'Maria Lopez', detail: 'Daughter · Regular payee', initials: 'ML', tone: 'bg-[#e9d5ff] text-[#6b21a8]' },
  { name: 'James Peterson', detail: 'Neighbor · Regular payee', initials: 'JP', tone: 'bg-[#bae6fd] text-[#075985]' },
  { name: 'City Utilities', detail: 'Utility bill', initials: 'CU', tone: 'bg-[#bbf7d0] text-[#166534]' },
]

export function SeniorList({ contactsView = false }: { contactsView?: boolean }) {
  const rows = contactsView
    ? contacts.map((c) => ({ ...c, amount: c.detail, date: '' }))
    : [
        {
          name: 'Maria Lopez',
          amount: '$85.00',
          date: 'Today, 10:42 AM',
          status: 'Sent',
          initials: 'ML',
          tone: 'bg-[#e9d5ff] text-[#6b21a8]',
        },
        {
          name: 'City Utilities',
          amount: '$120.00',
          date: 'Yesterday, 2:15 PM',
          status: 'Sent',
          initials: 'CU',
          tone: 'bg-[#bbf7d0] text-[#166534]',
        },
      ]
  return (
    <Card className="border-[#e7e8e2] shadow-none">
      <CardHeader className="p-6">
        <CardTitle className="text-2xl">{contactsView ? 'Trusted contacts' : 'Payment history'}</CardTitle>
        <CardDescription className="text-base">
          {contactsView ? 'People and businesses you pay regularly.' : 'Your recent payments, all in one simple list.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-6 pt-0">
        {rows.map((row: any) => (
          <div key={row.name} className="flex items-center justify-between rounded-2xl p-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                <AvatarFallback className={row.tone}>{row.initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold">{row.name}</p>
                <p className="text-base text-[#7a887e]">{row.amount}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-base text-[#69766d]">{row.date}</p>
              {row.status && <Badge className="mt-1 bg-[#dcfce7] text-[#15803d]">{row.status}</Badge>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
