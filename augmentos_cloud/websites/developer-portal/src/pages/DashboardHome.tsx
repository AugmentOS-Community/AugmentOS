// pages/DashboardHome.tsx
import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, PlusIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";

// Mock TPA data
const mockTpas = [
  {
    packageName: 'org.example.weatherapp',
    displayName: 'Weather App',
    createdAt: '2025-02-15',
    status: 'active',
  },
  {
    packageName: 'org.example.notesapp',
    displayName: 'Notes App',
    createdAt: '2025-02-20',
    status: 'inactive',
  }
];

const DashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const hasNoTpas = mockTpas.length === 0;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <Button
            className="gap-2"
            asChild
          >
            <Link to="/tpas/create">
              <PlusIcon className="h-4 w-4" />
              Create TPA
            </Link>
          </Button>
        </div>

        {hasNoTpas ? (
          // Empty state
          <Card className="bg-white shadow-sm border border-gray-200">
            <CardContent className="pt-6">
              <div className="text-center py-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No TPAs created yet</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating your first Third-Party Application.</p>
                <div className="mt-6">
                  <Button
                    className="gap-2"
                    onClick={() => navigate('/tpas/create')}
                  >
                    <Plus className="h-4 w-4" />
                    Create TPA
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Dashboard with TPAs
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Quick stats card */}
            <Card className="col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs font-medium text-gray-500 uppercase">Total TPAs</div>
                    <div className="mt-1 text-2xl font-semibold">{mockTpas.length}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="text-xs font-medium text-gray-500 uppercase">Active</div>
                    <div className="mt-1 text-2xl font-semibold">{mockTpas.filter(tpa => tpa.status === 'active').length}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documentation card */}
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Getting Started</CardTitle>
                <CardDescription>Learn how to build TPAs for AugmentOS</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-600">
                  Welcome to the AugmentOS Developer Portal! Here, you can create and manage your Third-Party Applications (TPAs) for the AugmentOS smart glasses platform.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-md p-4">
                    <h3 className="font-medium mb-2">Quick Start Guide</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Learn how to build your first TPA in minutes.
                    </p>
                    <Button variant="outline" size="sm">View Guide</Button>
                  </div>
                  <div className="border rounded-md p-4">
                    <h3 className="font-medium mb-2">API Documentation</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Explore the full AugmentOS API reference.
                    </p>
                    <Button variant="outline" size="sm">View API Docs</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* TPAs list card */}
            <Card className="col-span-1 lg:col-span-3">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Your TPAs</CardTitle>
                  <CardDescription>Manage your Third-Party Applications</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/tpas">
                    View All
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                      <tr>
                        <th scope="col" className="px-4 py-3 rounded-tl-lg">TPA Name</th>
                        <th scope="col" className="px-4 py-3">Package Name</th>
                        <th scope="col" className="px-4 py-3">Created</th>
                        <th scope="col" className="px-4 py-3">Status</th>
                        <th scope="col" className="px-4 py-3 rounded-tr-lg">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockTpas.map((tpa) => (
                        <tr key={tpa.packageName} className="bg-white border-b">
                          <td className="px-4 py-3 font-medium text-gray-900">{tpa.displayName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{tpa.packageName}</td>
                          <td className="px-4 py-3 text-gray-500">{tpa.createdAt}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tpa.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                              }`}>
                              {tpa.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" asChild>
                                <Link to={`/tpas/${tpa.packageName}/edit`}>
                                  Edit
                                </Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DashboardHome;