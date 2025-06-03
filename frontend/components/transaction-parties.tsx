import { User, Building } from "lucide-react"

export default function TransactionParties() {
  const parties = [
    {
      id: 1,
      name: "John Smith",
      role: "Buyer",
      email: "john.smith@example.com",
      type: "individual",
    },
    {
      id: 2,
      name: "Acme Real Estate LLC",
      role: "Seller",
      email: "contact@acmerealestate.com",
      type: "company",
    },
    {
      id: 3,
      name: "Secure Escrow Services",
      role: "Escrow Agent",
      email: "escrow@secureescrow.com",
      type: "company",
    },
  ]

  return (
    <div className="space-y-4">
      {parties.map((party) => (
        <div key={party.id} className="flex items-start space-x-3">
          <div
            className={`p-2 rounded-full ${
              party.type === "individual" ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
            }`}
          >
            {party.type === "individual" ? <User className="h-4 w-4" /> : <Building className="h-4 w-4" />}
          </div>
          <div>
            <p className="font-medium">{party.name}</p>
            <p className="text-sm text-gray-500">{party.role}</p>
            <p className="text-xs text-gray-400 mt-1">{party.email}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
