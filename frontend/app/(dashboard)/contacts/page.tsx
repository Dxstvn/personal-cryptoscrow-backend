"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoreHorizontal, Mail, Search, UserPlus, Bell, Check, X } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import {
  sendContactInvitation,
  getPendingInvitations,
  respondToInvitation,
  getUserContacts,
} from "@/services/contacts-api"
import { useToast } from "@/components/ui/use-toast"

type Contact = {
  id: string
  email: string
  first_name: string
  last_name: string
  phone_number?: string
  created_at: Date
}

type Invitation = {
  id: string
  senderId: string
  senderEmail: string
  senderName: string
  status: string
  createdAt: Date
}

export default function ContactsPage() {
  const { user, isDemoAccount } = useAuth()
  const { toast } = useToast()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("All Types")
  const [sortOrder, setSortOrder] = useState("Name (A-Z)")
  const [isLoading, setIsLoading] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [isSending, setIsSending] = useState(false)

  // Fetch contacts and pending invitations
  useEffect(() => {
    async function fetchData() {
      if (!user) return

      setIsLoading(true)
      try {
        // For demo account, use mock data
        if (isDemoAccount) {
          // Mock data for demo account
          setContacts([
            {
              id: "1",
              email: "sarah.johnson@example.com",
              first_name: "Sarah",
              last_name: "Johnson",
              phone_number: "555-123-4567",
              created_at: new Date(),
            },
            {
              id: "2",
              email: "michael.smith@example.com",
              first_name: "Michael",
              last_name: "Smith",
              phone_number: "555-987-6543",
              created_at: new Date(),
            },
          ])
          setPendingInvitations([
            {
              id: "1",
              senderId: "user123",
              senderEmail: "john.doe@example.com",
              senderName: "John Doe",
              status: "pending",
              createdAt: new Date(),
            },
          ])
        } else {
          // Fetch real data from API
          const [contactsData, invitationsData] = await Promise.all([getUserContacts(), getPendingInvitations()])
          setContacts(contactsData)
          setPendingInvitations(invitationsData)
        }
      } catch (error) {
        console.error("Error fetching contacts data:", error)
        toast({
          title: "Error",
          description: "Failed to load contacts. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [user, isDemoAccount, toast])

  // Filter and sort contacts
  const filteredContacts = contacts
    .filter((contact) => {
      // Search filter
      const fullName = `${contact.first_name} ${contact.last_name}`
      const matchesSearch =
        fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.email.toLowerCase().includes(searchQuery.toLowerCase())

      return matchesSearch
    })
    .sort((a, b) => {
      // Sort order
      const nameA = `${a.first_name} ${a.last_name}`
      const nameB = `${b.first_name} ${b.last_name}`

      if (sortOrder === "Name (A-Z)") {
        return nameA.localeCompare(nameB)
      } else if (sortOrder === "Name (Z-A)") {
        return nameB.localeCompare(nameA)
      } else if (sortOrder === "Recent") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      return 0
    })

  // Send invitation
  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setIsSending(true)
    try {
      await sendContactInvitation(inviteEmail)
      toast({
        title: "Invitation Sent",
        description: `Invitation sent to ${inviteEmail}`,
      })
      setInviteEmail("")
      setShowInviteForm(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }

  // Respond to invitation
  const handleInvitationResponse = async (invitationId: string, action: "accept" | "deny") => {
    try {
      await respondToInvitation(invitationId, action)

      // Update UI
      setPendingInvitations((prev) => prev.filter((invitation) => invitation.id !== invitationId))

      // If accepted, refresh contacts
      if (action === "accept") {
        const updatedContacts = await getUserContacts()
        setContacts(updatedContacts)
      }

      toast({
        title: action === "accept" ? "Invitation Accepted" : "Invitation Declined",
        description: action === "accept" ? "Contact has been added to your network" : "Invitation has been declined",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${action} invitation`,
        variant: "destructive",
      })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-gray-500">Manage your real estate transaction contacts</p>
        </div>
        <Button className="bg-teal-900 hover:bg-teal-800 text-white" onClick={() => setShowInviteForm(true)}>
          <UserPlus size={16} className="mr-2" /> Add Contact
        </Button>
      </div>

      {/* Pending Invitations Section */}
      {pendingInvitations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <h2 className="font-medium flex items-center text-amber-800 mb-2">
            <Bell size={16} className="mr-2" /> Pending Invitations
          </h2>
          <div className="space-y-3">
            {pendingInvitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between bg-white p-3 rounded-md shadow-sm">
                <div>
                  <p className="font-medium">{invitation.senderName}</p>
                  <p className="text-sm text-gray-500">{invitation.senderEmail}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-500 text-green-600 hover:bg-green-50"
                    onClick={() => handleInvitationResponse(invitation.id, "accept")}
                  >
                    <Check size={16} className="mr-1" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500 text-red-600 hover:bg-red-50"
                    onClick={() => handleInvitationResponse(invitation.id, "deny")}
                  >
                    <X size={16} className="mr-1" /> Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Form */}
      {showInviteForm && (
        <div className="bg-white rounded-lg border shadow-sm p-4 mb-4">
          <h2 className="font-medium mb-3">Invite a Contact</h2>
          <form onSubmit={handleSendInvitation} className="flex flex-col sm:flex-row gap-2">
            <Input
              type="email"
              placeholder="Enter email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              className="flex-grow"
            />
            <div className="flex gap-2">
              <Button type="submit" className="bg-teal-900 hover:bg-teal-800 text-white" disabled={isSending}>
                {isSending ? "Sending..." : "Send Invitation"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowInviteForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4 flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <Input
              type="text"
              placeholder="Search contacts..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <select
              className="border rounded-md px-3 py-2 bg-white"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option>Name (A-Z)</option>
              <option>Name (Z-A)</option>
              <option>Recent</option>
            </select>
            <Button variant="outline" size="icon">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span className="sr-only">Toggle view</span>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center border-t">
            <div className="animate-pulse flex flex-col items-center">
              <div className="rounded-full bg-gray-200 h-12 w-12 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2.5"></div>
              <div className="h-3 bg-gray-200 rounded w-1/3 mb-6"></div>
              <div className="h-10 bg-gray-200 rounded w-1/4"></div>
            </div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-8 text-center border-t">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No contacts found</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              {searchQuery
                ? "No contacts match your search criteria. Try adjusting your filters."
                : isDemoAccount
                  ? "You have no contacts yet. Add your first contact to get started."
                  : "You don't have any contacts yet. Send an invitation to add your first contact."}
            </p>
            <Button className="bg-teal-900 hover:bg-teal-800 text-white" onClick={() => setShowInviteForm(true)}>
              <UserPlus size={16} className="mr-2" /> Add Contact
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {filteredContacts.map((contact) => (
              <div key={contact.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center text-teal-800 font-medium text-lg mr-4">
                    {contact.first_name[0]}
                    {contact.last_name[0]}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center">
                      <h3 className="font-medium">
                        {contact.first_name} {contact.last_name}
                      </h3>
                    </div>
                    <div className="text-sm text-gray-500 flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                      <span>{contact.email}</span>
                      {contact.phone_number && (
                        <>
                          <span className="hidden md:inline">•</span>
                          <span>{contact.phone_number}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="hidden md:flex">
                      <Mail size={16} className="mr-1" /> Contact
                    </Button>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
