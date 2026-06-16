'use client'

import React, { useState } from "react"
import { RouteGuard } from '@/components/route-guard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { HelpCircle, Mail, Phone, MessageSquare, Search } from 'lucide-react'

const faqs = [
  {
    id: 1,
    question: 'How do I add a new route to the system?',
    answer:
      'To add a new route, navigate to Route Management and click the "Create Route" button. Fill in the route details including starting point, ending point, and number of stops. You can then assign buses to the route.',
  },
  {
    id: 2,
    question: 'Can I create multiple trips for the same route in a day?',
    answer:
      'Yes. You can create multiple trips per route. Go to Trips, select your route, and add the departure times you need.',
  },
  {
    id: 3,
    question: 'How do I track real-time bus locations?',
    answer:
      'Enable GPS tracking for your buses through the Bus Management page. Once enabled, you can view real-time locations, speed, and route adherence from the main dashboard.',
  },
  {
    id: 4,
    question: 'What happens if a bus needs maintenance?',
    answer:
      'Mark the bus as "Maintenance" in Bus Management. The system will automatically reassign its trips to other available buses. You can update the maintenance status once the work is complete.',
  },
  {
    id: 5,
    question: 'How do I generate performance reports?',
    answer:
      'Go to Reports & Analytics and select your desired date range. Choose from various report types including monthly performance, fleet maintenance, revenue analysis, and safety incidents.',
  },
  {
    id: 6,
    question: 'Can students view their assigned routes?',
    answer:
      'Yes, students can view available routes and set their favorites in the student portal. They receive notifications when their preferred routes are available.',
  },
]

const supportChannels = [
  {
    icon: Phone,
    title: 'Phone Support',
    description: 'Call our support team',
    contact: '+20 1212192694',
    hours: 'Mon-Fri, 9 AM - 5 PM',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10'
  },
  {
    icon: Mail,
    title: 'Email Support',
    description: 'Send us an email',
    contact: 'malakgamal485@gmail.com',
    hours: 'Response within 24 hours',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10'
  },
  {
    icon: MessageSquare,
    title: 'Live Chat',
    description: 'Chat with Root Admin',
    contact: 'Go to Support page',
    hours: 'Mon-Fri, 10 AM - 6 PM',
    color: 'text-green-500',
    bg: 'bg-green-500/10'
  },
]

export default function HelpPage() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <RouteGuard excludeRoles={['root']}>
      <div className="container max-w-6xl mx-auto space-y-8 p-6 pb-12">
        {/* Header */}
        <div className="space-y-4 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Help & Support</h1>
          <p className="text-lg text-muted-foreground">
            Find answers to common questions or get in touch with our support team.
          </p>
        </div>

        {/* Quick Search */}
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for answers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 bg-card border-border shadow-sm focus-visible:ring-primary"
          />
        </div>

        {/* Support Channels Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {supportChannels.map((channel) => {
            const Icon = channel.icon
            return (
              <Card key={channel.title} className="border-border bg-card hover:bg-accent/50 transition-all duration-300 hover:shadow-md cursor-default group">
                <CardHeader className="space-y-4">
                  <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${channel.bg} transition-colors group-hover:scale-105 duration-300`}>
                    <Icon className={`h-6 w-6 ${channel.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-semibold mb-1">{channel.title}</CardTitle>
                    <CardDescription className="text-sm">{channel.description}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="font-medium text-foreground">{channel.contact}</p>
                  <p className="text-xs text-muted-foreground font-medium">{channel.hours}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* FAQs Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <HelpCircle className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Frequently Asked Questions</h2>
          </div>

          <Card className="border-border bg-card/50 backdrop-blur-sm">
            <CardContent className="p-0">
              <Accordion type="single" collapsible className="w-full">
                {filteredFaqs.length > 0 ? (
                  filteredFaqs.map((faq) => (
                    <AccordionItem key={faq.id} value={faq.id.toString()} className="border-b last:border-0 px-6">
                      <AccordionTrigger className="hover:no-underline py-5 text-left font-medium text-foreground transition-all hover:text-primary">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="pb-5 text-muted-foreground leading-relaxed">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    No results found for &quot;{searchTerm}&quot;
                  </div>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </div>
    </RouteGuard>
  )
}
