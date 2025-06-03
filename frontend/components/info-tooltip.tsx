import type React from "react"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface InfoTooltipProps {
  content: React.ReactNode
  className?: string
}

export function InfoTooltip({ content, className }: InfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className={`h-4 w-4 text-teal-600 cursor-help ${className}`} />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
