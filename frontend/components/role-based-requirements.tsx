"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info, FileText, CheckSquare, Scale, Clock, Zap, DollarSign, Shield } from "lucide-react"
import { useState, useEffect } from "react"
// Import the CompactInfo component
import { CompactInfo } from "@/components/compact-info"

export interface ContractRequirements {
  // Seller requirements
  titleVerification: boolean
  inspectionReport: boolean
  appraisalService: boolean

  // Buyer requirements
  fundingRequired: boolean // This is always true, but we keep it for data structure consistency

  // Common requirements
  escrowPeriod: number
  automaticRelease: boolean
  disputeResolution: boolean
}

interface RoleBasedRequirementsProps {
  transactionType: "purchase" | "sale"
  onChange: (options: ContractRequirements) => void
  initialOptions?: ContractRequirements
}

export default function RoleBasedRequirements({
  transactionType,
  onChange,
  initialOptions,
}: RoleBasedRequirementsProps) {
  const isBuyer = transactionType === "purchase"
  const isSeller = transactionType === "sale"

  const [options, setOptions] = useState<ContractRequirements>(
    initialOptions || {
      // Seller requirements
      titleVerification: true,
      inspectionReport: true,
      appraisalService: false,

      // Buyer requirements - always true
      fundingRequired: true,

      // Common requirements
      escrowPeriod: 30,
      automaticRelease: true,
      disputeResolution: true,
    },
  )

  useEffect(() => {
    if (initialOptions) {
      // Ensure fundingRequired is always true regardless of what's passed in
      setOptions({
        ...initialOptions,
        fundingRequired: true,
      })
    }
  }, [initialOptions])

  const handleChange = (key: keyof ContractRequirements, value: boolean | number) => {
    // Don't allow changing fundingRequired - it's always true
    if (key === "fundingRequired") return

    const newOptions = { ...options, [key]: value }
    setOptions(newOptions)
    onChange(newOptions)
  }

  // For sellers, just show that the buyer must provide funds
  if (isSeller) {
    return (
      <div className="space-y-6">
        <CompactInfo title="Buyer's Responsibility" variant="info" defaultOpen={true}>
          The buyer will be required to deposit funds into the escrow contract. These funds will be held securely until
          all conditions are met.
        </CompactInfo>

        <Card className="border-teal-100">
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-teal-600" />
                  <Label className="font-medium text-teal-900">Buyer Must Provide Funds</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-teal-600" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        The buyer will be required to deposit the agreed amount into the escrow contract
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch checked={true} disabled className="data-[state=checked]:bg-teal-600" />
              </div>

              <CompactInfo title="Your Requirements as Seller" variant="warning" icon={<Shield className="h-4 w-4" />}>
                As the seller, you'll need to provide the following documentation to fulfill the escrow requirements:
                <ul className="list-disc list-inside mt-2">
                  {options.titleVerification && <li>Title Deeds Submission</li>}
                  {options.inspectionReport && <li>Inspection Report</li>}
                  {options.appraisalService && <li>Property Appraisal</li>}
                </ul>
              </CompactInfo>

              <div className="pt-4 border-t border-neutral-200">
                <h3 className="font-medium text-teal-900 mb-4">Common Requirements</h3>

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
                          Automatically releases funds from escrow when all required conditions are verified
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

                <div className="flex items-center justify-between mt-4">
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
                          Includes a dispute resolution mechanism in the smart contract to handle disagreements
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

                <div className="flex items-center justify-between mt-4">
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
                          Maximum time period for the escrow before automatic refund if conditions are not met
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
      </div>
    )
  }

  // For buyers, show the full documentation requirements UI
  return (
    <div className="space-y-6">
      <CompactInfo title="Requirements for the Seller (Set by You as Buyer)" variant="info">
        As the buyer, you're setting these requirements that the seller must fulfill before funds will be released from
        escrow.
      </CompactInfo>

      {/* Buyer's funding requirement notice */}
      <CompactInfo title="Your Responsibility as Buyer" variant="warning" icon={<DollarSign className="h-4 w-4" />}>
        As the buyer, you will be required to deposit funds into the escrow contract. These funds will be held securely
        until all conditions are met.
      </CompactInfo>

      <Card className="border-teal-100">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Seller's documentation requirements - configurable by buyer */}
            <div className="mb-4">
              <h3 className="font-medium text-teal-900 mb-2">Documentation Required from Seller</h3>
              <p className="text-sm text-neutral-600 mb-4">
                Select which documents the seller must provide before funds will be released from escrow.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-teal-600" />
                <Label htmlFor="title-verification" className="font-medium text-teal-900">
                  Title Deeds Submission
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-teal-600" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Requires the seller to submit property title deeds to verify there are no liens or encumbrances
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
                  Inspection Report
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-teal-600" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Requires the seller to provide a professional inspection report before funds can be released
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
                  Property Appraisal
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-teal-600" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Requires the seller to provide a professional property appraisal before funds can be released
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

            {/* Common requirements for both roles */}
            <div className="pt-4 border-t border-neutral-200">
              <h3 className="font-medium text-teal-900 mb-4">Common Requirements</h3>

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
                        Automatically releases funds from escrow when all required conditions are verified
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

              <div className="flex items-center justify-between mt-4">
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
                        Includes a dispute resolution mechanism in the smart contract to handle disagreements
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

              <div className="flex items-center justify-between mt-4">
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
                        Maximum time period for the escrow before automatic refund if conditions are not met
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
    </div>
  )
}
