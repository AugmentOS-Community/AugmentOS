import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2, Building, Globe, Mail, FileText, Image, AlertTriangle, LockIcon } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import api from '@/services/api.service';
import { toast } from 'sonner';
import { useOrganization } from '@/context/OrganizationContext';
import { useOrgPermissions } from '@/hooks/useOrgPermissions';

/**
 * Organization settings page - allows editing the current organization's profile
 */
const OrganizationSettings: React.FC = () => {
  const { currentOrg, refreshOrgs, ensurePersonalOrg, loading: orgLoading } = useOrganization();
  const { isAdmin, loading: permissionsLoading } = useOrgPermissions();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    profile: {
      website: '',
      contactEmail: '',
      description: '',
      logo: ''
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Handle missing organization by creating a personal one
  useEffect(() => {
    const createPersonalOrg = async () => {
      if (!currentOrg && !orgLoading && !isCreatingOrg) {
        setIsCreatingOrg(true);
        try {
          await ensurePersonalOrg();
          toast.success('A personal organization has been created for you.');
        } catch (err) {
          console.error('Error creating personal organization:', err);
          toast.error('Failed to create a personal organization. Please try again.');
        } finally {
          setIsCreatingOrg(false);
        }
      }
    };

    createPersonalOrg();
  }, [currentOrg, orgLoading, ensurePersonalOrg, isCreatingOrg]);

  // Fetch organization data
  useEffect(() => {
    const fetchOrgData = async () => {
      if (!currentOrg) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Get the latest organization data
        const org = await api.orgs.get(currentOrg.id);

        // Set form data
        setFormData({
          name: org.name || '',
          profile: {
            website: org.profile?.website || '',
            contactEmail: org.profile?.contactEmail || '',
            description: org.profile?.description || '',
            logo: org.profile?.logo || ''
          }
        });
      } catch (err) {
        console.error('Error fetching organization data:', err);
        setError('Failed to load organization data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrgData();
  }, [currentOrg]);

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const name = e.target.name as string;
    const value = e.target.value;

    if (name === 'name') {
      setFormData(prev => ({
        ...prev,
        name: value
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        profile: {
          ...prev.profile,
          [name]: value
        }
      }));
    }
  };

  // Validate form
  const validateForm = () => {
    if (!formData.name || formData.name.trim() === '') {
      setError('Organization name is required');
      return false;
    }

    if (!formData.profile.contactEmail || formData.profile.contactEmail.trim() === '') {
      setError('Contact email is required');
      return false;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.profile.contactEmail)) {
      setError('Please enter a valid contact email address');
      return false;
    }

    return true;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentOrg) {
      setError('No organization selected');
      return;
    }

    setError(null);
    setIsSaved(false);

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      // Update organization via API
      await api.orgs.update(currentOrg.id, formData);

      // Refresh organizations in context
      await refreshOrgs();

      // Show success message
      setIsSaved(true);
      toast.success('Organization updated successfully');

      // Reset saved status after 3 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (err) {
      console.error('Error updating organization:', err);
      setError('Failed to update organization. Please try again.');
      toast.error('Failed to update organization');
    } finally {
      setIsSaving(false);
    }
  };

  // If no organization selected but we're creating one, show loading state
  if (!currentOrg) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Organization Settings</CardTitle>
              <CardDescription>
                {isCreatingOrg
                  ? 'Creating a personal organization for you...'
                  : 'No organization selected'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isCreatingOrg ? (
                <div className="flex flex-col items-center justify-center p-6">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Creating your personal organization...</p>
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You don't have an active organization. Please wait while we create one for you.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Card className="shadow-sm">
          {isLoading || permissionsLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin mx-auto h-8 w-8 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
              <p className="mt-2 text-gray-500">Loading organization data...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle className="text-2xl">Organization Settings</CardTitle>
                <CardDescription>
                  {isAdmin
                    ? "Update your organization information which will be displayed on your app's page in the App Store."
                    : "View organization information (read-only). Only administrators can update these settings."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {isSaved && (
                  <Alert className="bg-green-50 text-green-800 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">Organization updated successfully!</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    Organization Name <span className="text-red-500 ml-1">*</span>
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your organization name"
                    required
                    readOnly={!isAdmin}
                    className={!isAdmin ? "bg-gray-50 text-gray-500" : ""}
                  />
                  <p className="text-xs text-gray-500">
                    The name of your organization that will be displayed to users. Required to publish apps.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Website
                  </Label>
                  <Input
                    id="website"
                    name="website"
                    value={formData.profile.website}
                    onChange={handleChange}
                    placeholder="https://example.com"
                    readOnly={!isAdmin}
                    className={!isAdmin ? "bg-gray-50 text-gray-500" : ""}
                  />
                  <p className="text-xs text-gray-500">
                    Your organization's website URL.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactEmail" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Contact Email <span className="text-red-500 ml-1">*</span>
                  </Label>
                  <Input
                    id="contactEmail"
                    name="contactEmail"
                    value={formData.profile.contactEmail}
                    onChange={handleChange}
                    placeholder="support@example.com"
                    required
                    type="email"
                    readOnly={!isAdmin}
                    className={!isAdmin ? "bg-gray-50 text-gray-500" : ""}
                  />
                  <p className="text-xs text-gray-500">
                    An email address where users can contact you for support or inquiries. Required to publish apps.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Organization Description
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.profile.description}
                    onChange={handleChange}
                    placeholder="Tell users about your organization"
                    rows={4}
                    readOnly={!isAdmin}
                    className={!isAdmin ? "bg-gray-50 text-gray-500" : ""}
                  />
                  <p className="text-xs text-gray-500">
                    A short description of your organization.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logo" className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Logo URL
                  </Label>
                  <Input
                    id="logo"
                    name="logo"
                    value={formData.profile.logo}
                    onChange={handleChange}
                    placeholder="https://example.com/logo.png"
                    readOnly={!isAdmin}
                    className={!isAdmin ? "bg-gray-50 text-gray-500" : ""}
                  />
                  <p className="text-xs text-gray-500">
                    A URL to your organization logo (recommended: square format, 512x512 PNG).
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end p-6">
                {isAdmin ? (
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Contact an administrator to make changes
                  </p>
                )}
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default OrganizationSettings;