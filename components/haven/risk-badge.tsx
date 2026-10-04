import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function RiskBadge({ level }: { level: 'Low' | 'Medium' | 'High' }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-full border-0 px-2.5 py-1 text-xs font-semibold',
        level === 'Low'
          ? 'bg-[#dcfce7] text-[#15803d]'
          : level === 'Medium'
            ? 'bg-[#fef3c7] text-[#a16207]'
            : 'bg-[#fee2e2] text-[#b91c1c]',
      )}
    >
      {level} risk
    </Badge>
  )
}
