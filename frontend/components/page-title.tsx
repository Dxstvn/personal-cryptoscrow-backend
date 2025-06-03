import type { ReactNode } from "react"

interface PageTitleProps {
  title: string
  description?: string
  actions?: ReactNode
}

export default function PageTitle({ title, description, actions }: PageTitleProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  )
}
