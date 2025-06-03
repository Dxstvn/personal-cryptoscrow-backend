"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info, FileText, CheckSquare, Scale, Clock, Zap } from "lucide-react"

interface SmartContractOptionsProps {
  onChange: (options: SmartContractOptions) => void
  initialOptions?: SmartContractOptions
}

export interface SmartContractOptions {
  titleVerification: boolean
  inspectionReport: boolean
  appraisalService: boolean
  escrowPeriod: number
  automaticRelease: boolean
  disputeResolution: boolean
}

export default function SmartContractOptions({ onChange, initialOptions }: SmartContractOptionsProps) {
  const [options, setOptions] = useState<SmartContractOptions>(
    initialOptions || {
      titleVerification: true,
      inspectionReport: true,
      appraisalService: false,
      escrowPeriod: 30,
      automaticRelease: true,
      disputeResolution: true,
    },
  )

  useEffect(() => {
    if (initialOptions) {
      setOptions(initialOptions)
    }
  }, [initialOptions])

  const handleChange = (key: keyof SmartContractOptions, value: boolean | number) => {
    const newOptions = { ...options, [key]: value }
    setOptions(newOptions)
    onChange(newOptions)
  }

  return (
    <Card className="border-teal-100">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-teal-600" />
              <Label htmlFor="title-verification" className="font-medium text-teal-900">
                Title Deeds Submission Required
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-teal-600" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Requires submission of property title deeds to verify there are no liens or encumbrances before
                    funds can be released from escrow
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Switch
              id="title-verification"
              checked={options.titleVerification}
              onCheckedChange={(checked) => handleChange("titleVerification", checked)}
              className="data-[state=checked]:bg-teal-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-600" />
              <Label htmlFor="inspection-report" className="font-medium text-teal-900">
                Inspection Report Required
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-teal-600" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Requires a professional inspection report to be submitted and approved before funds can be released
                    from escrow
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Switch
              id="inspection-report"
              checked={options.inspectionReport}
              onCheckedChange={(checked) => handleChange("inspectionReport", checked)}
              className="data-[state=checked]:bg-teal-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-600" />
              <Label htmlFor="appraisal-service" className="font-medium text-teal-900">
                Appraisal Service Required
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-teal-600" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Requires a professional property appraisal to be submitted and approved before funds can be released
                    from escrow
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Switch
              id="appraisal-service"
              checked={options.appraisalService}
              onCheckedChange={(checked) => handleChange("appraisalService", checked)}
              className="data-[state=checked]:bg-teal-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-teal-600" />
              <Label htmlFor="automatic-release" className="font-medium text-teal-900">
                Automatic Release When Verified
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-teal-600" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Automatically releases funds from escrow when all required conditions are verified, without
                    requiring additional manual approval
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Switch
              id="automatic-release"
              checked={options.automaticRelease}
              onCheckedChange={(checked) => handleChange("automaticRelease", checked)}
              className="data-[state=checked]:bg-teal-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-teal-600" />
              <Label htmlFor="dispute-resolution" className="font-medium text-teal-900">
                Dispute Resolution Mechanism
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-teal-600" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Includes a dispute resolution mechanism in the smart contract to handle disagreements between
                    parties
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Switch
              id="dispute-resolution"
              checked={options.disputeResolution}
              onCheckedChange={(checked) => handleChange("disputeResolution", checked)}
              className="data-[state=checked]:bg-teal-600"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-teal-600" />
                <Label htmlFor="escrow-period" className="font-medium text-teal-900">
                  Maximum Escrow Period (days)
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-teal-600" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Maximum time period for the escrow before automatic refund to the buyer if conditions are not met
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="escrow-period"
                type="number"
                min="1"
                max="365"
                value={options.escrowPeriod}
                onChange={(e) => handleChange("escrowPeriod", Number.parseInt(e.target.value) || 30)}
                className="w-20 text-right"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
