import * as React from "react"
import { cn } from "../../lib/utils"

const PageContainer = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => (
        <div
            ref={ref}
            className={cn(
                "w-full max-w-container mx-auto px-4 md:px-8 py-8 md:py-section-py",
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
)
PageContainer.displayName = "PageContainer"

export { PageContainer }
