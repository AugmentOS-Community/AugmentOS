// pages/EditTPA.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircle2, AlertCircle, Loader2, KeyRound, Copy, RefreshCw, Share2, LinkIcon, Upload, MoveIcon } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import api, { Organization } from '@/services/api.service';
import { TPA, Permission } from '@/types/tpa';
import { toast } from 'sonner';
import ApiKeyDialog from '../components/dialogs/ApiKeyDialog';
import SharingDialog from '../components/dialogs/SharingDialog';
import PublishDialog from '../components/dialogs/PublishDialog';
import { TpaType } from '@augmentos/sdk';
import { normalizeUrl } from '@/libs/utils';
import PermissionsForm from '../components/forms/PermissionsForm';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '@/context/OrganizationContext';
import publicEmailDomains from 'email-providers/all.json';
import MoveOrgDialog from '../components/dialogs/MoveOrgDialog';

// Extend TPA type locally to include sharedWithOrganization
interface EditableTPA extends TPA {
  sharedWithOrganization?: boolean;
}

const EditTPA: React.FC = () => {
  const navigate = useNavigate();
  const { packageName } = useParams<{ packageName: string }>();
  const { user } = useAuth();
  const { currentOrg } = useOrganization();

  // Form state
  const [formData, setFormData] = useState<EditableTPA>({
    id: '',
    packageName: '',
    name: '',
    description: '',
    publicUrl: '',
    logoURL: '',
    isPublic: false,
    appStoreStatus: 'DEVELOPMENT',
    tpaType: 'standard' as TpaType, // Default value for TpaType with cast
    createdAt: new Date().toISOString(), // Default value for AppResponse compatibility
    updatedAt: new Date().toISOString(), // Default value for AppResponse compatibility
    permissions: [], // Initialize permissions as empty array
  });

  // Permissions state
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [isSharingDialogOpen, setIsSharingDialogOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [isLoadingShareLink, setIsLoadingShareLink] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Add sharedWithEmails state
  const [sharedWithEmails, setSharedWithEmails] = useState<string[]>([]);
  const [newShareEmail, setNewShareEmail] = useState('');
  const [isUpdatingEmails, setIsUpdatingEmails] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // State for organization transfer
  const [isMoveOrgDialogOpen, setIsMoveOrgDialogOpen] = useState(false);
  const [eligibleOrgs, setEligibleOrgs] = useState<Organization[]>([]);
  const [isMovingOrg, setIsMovingOrg] = useState(false);

  // Helper to get org domain from user email
  const orgDomain = user?.email?.split('@')[1] || '';
  // Check if orgDomain is a public email provider
  const isPublicEmailDomain = publicEmailDomains.includes(orgDomain);

  // Fetch TPA data and permissions from API + check for eligible orgs for transfer
  useEffect(() => {
    const fetchData = async () => {
      if (!packageName || !currentOrg) return;

      try {
        setIsLoading(true);
        setIsLoadingPermissions(true);
        setError(null);

        // Fetch TPA data using organization ID
        const tpaData = await api.apps.getByPackageName(packageName, currentOrg.id);

        // Convert API response to TPA type
        const tpa: EditableTPA = {
          id: tpaData.packageName, // Using packageName as id since API doesn't return id
          packageName: tpaData.packageName,
          name: tpaData.name,
          description: tpaData.description || '',
          publicUrl: tpaData.publicUrl || '',
          logoURL: tpaData.logoURL,
          webviewURL: tpaData.webviewURL,
          isPublic: tpaData.isPublic || false,
          appStoreStatus: tpaData.appStoreStatus || 'DEVELOPMENT',
          tpaType: tpaData.tpaType || ('standard' as TpaType),
          createdAt: tpaData.createdAt,
          updatedAt: tpaData.updatedAt,
          reviewNotes: tpaData.reviewNotes,
          reviewedBy: tpaData.reviewedBy,
          reviewedAt: tpaData.reviewedAt,
        };

        setFormData(tpa);

        // Fetch permissions
        try {
          const permissionsData = await api.apps.permissions.get(packageName);
          if (permissionsData.permissions) {
            setFormData(prev => ({ ...prev, permissions: permissionsData.permissions }));
          }
        } catch (permError) {
          console.error('Error fetching permissions:', permError);
          // Don't fail the whole form load if permissions fail
        } finally {
          setIsLoadingPermissions(false);
        }

        // Set sharedWithEmails
        if (Array.isArray(tpaData.sharedWithEmails)) {
          setSharedWithEmails(tpaData.sharedWithEmails);
        }

        // Fetch all orgs where the user has admin access
        try {
          const allOrgs = await api.orgs.list();

          // Get the user's full profile to access ID
          let userId = '';
          try {
            const userProfile = await api.auth.me();
            userId = userProfile.id;
            console.log("Current user ID:", userId);
          } catch (err) {
            console.error("Failed to fetch user profile:", err);
          }

          // Filter to only include orgs where the user has admin/owner access
          const adminOrgs = allOrgs.filter(org => {

            // Handle member structure
            if (Array.isArray(org.members)) {
              for (const member of org.members) {
                const role = member.role;

                // Case 1: Direct string comparison with user ID
                if (userId && typeof member.user === 'string' && member.user === userId) {
                  return role === 'admin' || role === 'owner';
                }

                // Case 2: Compare with user object with email
                if (typeof member.user === 'object' && member.user && member.user.email === user?.email) {
                  return role === 'admin' || role === 'owner';
                }
              }
            }
            return false;
          });
          setEligibleOrgs(adminOrgs);
        } catch (orgError) {
          console.error('Error fetching organizations:', orgError);
        }
      } catch (err) {
        console.error('Error fetching TPA:', err);
        setError('Failed to load TPA data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [packageName, currentOrg, user?.email]);

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.currentTarget;

    // For URL fields, normalize on blur instead of on every keystroke
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle URL field blur event to normalize URLs
  const handleUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;

    // Only normalize URL fields
    if (name === 'publicUrl' || name === 'logoURL' || name === 'webviewURL') {
      if (value) {
        try {
          // Normalize the URL and update the form field
          const normalizedUrl = normalizeUrl(value);
          setFormData(prev => ({
            ...prev,
            [name]: normalizedUrl
          }));
        } catch (error) {
          console.error(`Error normalizing ${name}:`, error);
        }
      }
    }
  };

  // Handle permissions changes
  const handlePermissionsChange = (permissions: Permission[]) => {
    setFormData(prev => ({
      ...prev,
      permissions
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setIsSaved(false);

    try {
      if (!packageName) throw new Error('Package name is missing');
      if (!currentOrg) throw new Error('No organization selected');

      // Normalize URLs before submission
      const normalizedData = {
        name: formData.name,
        description: formData.description,
        publicUrl: formData.publicUrl ? normalizeUrl(formData.publicUrl) : '',
        logoURL: formData.logoURL ? normalizeUrl(formData.logoURL) : '',
        webviewURL: formData.webviewURL ? normalizeUrl(formData.webviewURL) : '',
        tpaType: formData.tpaType,
      };

      // Update TPA data
      await api.apps.update(packageName, normalizedData, currentOrg.id);

      // Update permissions
      if (formData.permissions) {
        await api.apps.permissions.update(packageName, formData.permissions);
      }

      // Show success message
      setIsSaved(true);
      toast.success('App updated successfully');

      // Reset saved status after 3 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (err) {
      console.error('Error updating TPA:', err);
      setError('Failed to update app. Please try again.');
      toast.error('Failed to update app');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle API key regeneration
  const handleRegenerateApiKey = async () => {
    try {
      if (!packageName) throw new Error('Package name is missing');
      if (!currentOrg) throw new Error('No organization selected');

      setIsRegeneratingKey(true);
      setError(null);

      // Regenerate API key via API
      const response = await api.apps.apiKey.regenerate(packageName, currentOrg.id);

      // Update local state with new API key
      setApiKey(response.apiKey);

      toast.success('API key regenerated successfully');
    } catch (err) {
      console.error('Error regenerating API key:', err);
      toast.error('Failed to regenerate API key');
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  // Handle opening the API key dialog without regenerating
  const handleViewApiKey = () => {
    // We just open the dialog with the placeholder key
    // For security reasons, we don't fetch the real key
    setApiKey(""); // Use empty string to get placeholder

    // Clear any existing success messages
    setIsSaved(false);

    // Dismiss ALL existing toasts
    // Check if document is available (browser environment)
    if (typeof document !== 'undefined') {
      const allToasts = document.querySelectorAll('[role="status"]');
      allToasts.forEach((toast) => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      });
    }
    toast.dismiss();

    // Then open the dialog
    setIsApiKeyDialogOpen(true);
  };

  // Handle getting and copying share link
  const handleGetShareLink = async () => {
    try {
      if (!packageName) throw new Error('Package name is missing');
      if (!currentOrg) throw new Error('No organization selected');

      setIsLoadingShareLink(true);
      setError(null);

      // Get share link via API
      const shareUrl = await api.sharing.getInstallLink(packageName, currentOrg.id);

      // Update local state with share link
      setShareLink(shareUrl);

      // Open sharing dialog
      setIsSharingDialogOpen(true);
    } catch (err) {
      console.error('Error generating share link:', err);
      toast.error('Failed to generate sharing link');
    } finally {
      setIsLoadingShareLink(false);
    }
  };

  // Handle opening publish dialog
  const handleOpenPublishDialog = () => {
    setIsPublishDialogOpen(true);
  };

  // Handle successful publish (called after dialog completes)
  const handlePublishComplete = async () => {
    if (!packageName || !currentOrg) return;

    try {
      // Refresh TPA data to get updated app status
      const updatedTpa = await api.apps.getByPackageName(packageName, currentOrg.id);

      // Update form data with new app status
      setFormData(prev => ({
        ...prev,
        appStoreStatus: updatedTpa.appStoreStatus || prev.appStoreStatus
      }));

      toast.success('Publication status updated');
    } catch (err) {
      console.error('Error refreshing TPA status:', err);
    }
  };

  // Handler to add a new email to the share list
  const handleAddShareEmail = async () => {
    try {
      if (!packageName) throw new Error('Package name is missing');
      if (!currentOrg) throw new Error('No organization selected');
      if (!newShareEmail.trim()) return;

      setIsUpdatingEmails(true);
      setEmailError(null);

      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newShareEmail)) {
        setEmailError('Please enter a valid email address');
        setIsUpdatingEmails(false);
        return;
      }

      // Check if email already in list
      if (sharedWithEmails.includes(newShareEmail)) {
        setEmailError('This email is already in the list');
        setIsUpdatingEmails(false);
        return;
      }

      // Update emails via API
      const updatedEmails = [...sharedWithEmails, newShareEmail];
      await api.apps.updateSharedEmails(packageName, updatedEmails);

      // Update local state
      setSharedWithEmails(updatedEmails);
      setNewShareEmail('');

      toast.success(`Shared with ${newShareEmail}`);

      // Also track via the sharing API
      await api.sharing.trackSharing(packageName, [newShareEmail], currentOrg.id);
    } catch (err) {
      console.error('Error adding share email:', err);
      toast.error('Failed to add email');
    } finally {
      setIsUpdatingEmails(false);
    }
  };

  // Handler to remove an email from the share list
  const handleRemoveShareEmail = async (email: string) => {
    try {
      if (!packageName) throw new Error('Package name is missing');
      if (!currentOrg) throw new Error('No organization selected');

      setIsUpdatingEmails(true);

      // Filter out the email to remove
      const updatedEmails = sharedWithEmails.filter(e => e !== email);

      // Update emails via API
      await api.apps.updateSharedEmails(packageName, updatedEmails);

      // Update local state
      setSharedWithEmails(updatedEmails);

      toast.success(`Removed ${email} from shared list`);
    } catch (err) {
      console.error('Error removing share email:', err);
      toast.error('Failed to remove email');
    } finally {
      setIsUpdatingEmails(false);
    }
  };

  // Handle TPA organization move
  const handleMoveToOrg = async (targetOrgId: string) => {
    if (!packageName || !currentOrg) return;

    try {
      setIsMovingOrg(true);

      // Call API to move TPA to the target organization
      await api.apps.moveToOrg(packageName, targetOrgId, currentOrg.id);

      // Show success message
      toast.success(`App moved to new organization successfully`);

      // Redirect to the TPAs list after a short delay
      setTimeout(() => {
        navigate('/tpas');
      }, 1500);
    } catch (err) {
      console.error('Error moving TPA to new organization:', err);
      throw new Error('Failed to move app to the new organization. Please try again.');
    } finally {
      setIsMovingOrg(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center mb-6">
          <Link to="/tpas" className="flex items-center text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back to apps
          </Link>
        </div>

        <Card className="shadow-sm">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin mx-auto h-8 w-8 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
              <p className="mt-2 text-gray-500">Loading app data...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle className="text-2xl">Edit App</CardTitle>
                <CardDescription>
                  Update your apps for AugmentOS.
                </CardDescription>
                {currentOrg && (
                  <div className="mt-2 mb-3 text-sm flex items-center justify-between">
                    <div>
                      <span className="text-gray-500">Organization: </span>
                      <span className="font-medium">{currentOrg.name}</span>
                    </div>

                    {/* Move Organization button - only show if user has admin access to multiple orgs */}
                    {eligibleOrgs.length > 1 && (
                      <Button
                        onClick={() => setIsMoveOrgDialogOpen(true)}
                        className="gap-2"
                        type="button"
                        variant="outline"
                        size="sm"
                      >
                        <MoveIcon className="h-4 w-4" />
                        Move to Org
                      </Button>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-6 pb-5">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {isSaved && (
                  <Alert className="bg-green-50 text-green-800 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700">TPA updated successfully!</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="packageName">Package Name</Label>
                  <Input
                    id="packageName"
                    name="packageName"
                    value={formData.packageName}
                    disabled
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-gray-500">
                    Package names cannot be changed after creation.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g., My Awesome App"
                  />
                  <p className="text-xs text-gray-500">
                    The name that will be displayed to users in the AugmentOS app store.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Describe what your app does..."
                    rows={3}
                  />
                  <p className="text-xs text-gray-500">
                    Provide a clear, concise description of your application's functionality.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="publicUrl">Server URL</Label>
                  <Input
                    id="publicUrl"
                    name="publicUrl"
                    value={formData.publicUrl}
                    onChange={handleChange}
                    onBlur={handleUrlBlur}
                    placeholder="yourserver.com"
                  />
                  <p className="text-xs text-gray-500">
                    The base URL of your server where AugmentOS will communicate with your app.
                    We'll automatically append "/webhook" to handle events when your app is activated.
                    HTTPS is required and will be added automatically if not specified.
                    Do not include a trailing slash - it will be automatically removed.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoURL">Logo URL</Label>
                  <Input
                    id="logoURL"
                    name="logoURL"
                    value={formData.logoURL}
                    onChange={handleChange}
                    onBlur={handleUrlBlur}
                    placeholder="yourserver.com/logo.png"
                  />
                  <p className="text-xs text-gray-500">
                    URL to an image that will be used as your app's icon (recommended: 512x512 PNG).
                    HTTPS is required and will be added automatically if not specified.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="webviewURL">Webview URL (Optional)</Label>
                  <Input
                    id="webviewURL"
                    name="webviewURL"
                    value={formData.webviewURL || ''}
                    onChange={handleChange}
                    onBlur={handleUrlBlur}
                    placeholder="yourserver.com/webview"
                  />
                  <p className="text-xs text-gray-500">
                    If your app has a companion mobile interface, provide the URL here.
                    HTTPS is required and will be added automatically if not specified.
                  </p>
                </div>

                {/* App Sharing Section */}
                <div className="space-y-8 mt-6">
                  {/* Share with Testers */}
                  <div className="border rounded-lg bg-white p-8 shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <span className="inline-block bg-green-100 rounded-full p-2 mr-2"><LinkIcon className="h-5 w-5 text-green-600" /></span>
                      Share with Testers
                    </h3>
                    <p className="text-sm text-gray-600 mb-6 ml-9">
                      Anyone with this link can access and test the app (read-only access).
                    </p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 ml-9 mt-2">
                      <Button
                        onClick={handleGetShareLink}
                        className="gap-2"
                        type="button"
                        variant="outline"
                        disabled={isLoadingShareLink}
                      >
                        {isLoadingShareLink ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <LinkIcon className="h-4 w-4" />
                            Share App
                          </>
                        )}
                      </Button>
                      {shareLink && (
                        <span className="text-xs text-blue-600 break-all ml-2 mt-1 sm:mt-0">{shareLink}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* API Key section */}
                <div className="border rounded-md p-4 mt-6">
                  <h3 className="text-lg font-medium mb-2 flex items-center">
                    <KeyRound className="h-5 w-5 mr-2" />
                    API Key
                  </h3>

                  <p className="text-sm text-gray-600 mb-4">
                    Your API key is used to authenticate your app with AugmentOS cloud services.
                    Keep it secure and never share it publicly.
                  </p>

                  <div className="flex items-center justify-end">
                    <Button
                      onClick={handleViewApiKey}
                      className="mr-2"
                      variant="outline" /* Explicitly set type to button to prevent form submission */
                    >
                      View Key
                    </Button>

                    <Button
                      onClick={handleRegenerateApiKey}
                      disabled={isRegeneratingKey}
                      variant="secondary"
                      type="button" /* Explicitly set type to button to prevent form submission */
                    >
                      {isRegeneratingKey ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Regenerate Key
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Status information */}
                <div className="border rounded-md p-4 mt-6">
                  <h3 className="text-lg font-medium mb-2 flex items-center">
                    <Upload className="h-5 w-5 mr-2" />
                    App Status: {
                    formData.appStoreStatus === 'DEVELOPMENT' ? 'Development' :
                    formData.appStoreStatus === 'SUBMITTED' ? 'Submitted for Review' :
                    formData.appStoreStatus === 'REJECTED' ? 'Rejected' :
                    formData.appStoreStatus === 'PUBLISHED' ? 'Published' : 'Development'
                  }</h3>

                  <p className="text-sm text-gray-600 mb-4">
                    {formData.appStoreStatus === 'DEVELOPMENT'
                      ? 'Your app is currently in development. Publish it when ready to submit for review.'
                      : formData.appStoreStatus === 'SUBMITTED'
                      ? 'Your app has been submitted for review. Once approved, it will be published to the App Store.'
                      : formData.appStoreStatus === 'REJECTED'
                      ? 'Your app has been rejected. Please review the feedback and make the necessary changes before resubmitting.'
                      : 'Your app is published and available to all AugmentOS users in the App Store.'}
                  </p>

                  {formData.appStoreStatus === 'REJECTED' && formData.reviewNotes && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 mt-2 mb-4">
                      <h4 className="text-sm font-medium text-red-800 mb-1">Rejection Reason:</h4>
                      <p className="text-sm text-red-700">{formData.reviewNotes}</p>
                      {formData.reviewedAt && (
                        <p className="text-xs text-red-500 mt-2">
                          Reviewed on {new Date(formData.reviewedAt).toLocaleDateString()} by {formData.reviewedBy?.split('@')[0] || 'Admin'}
                        </p>
                      )}
                    </div>
                  )}

                  {(formData.appStoreStatus === 'DEVELOPMENT' || formData.appStoreStatus === 'REJECTED') && (
                    <div className="flex items-center justify-end">
                      <Button
                        onClick={handleOpenPublishDialog}
                        className="gap-2"
                        type="button"
                      >
                        <Upload className="h-4 w-4" />
                        {formData.appStoreStatus === 'REJECTED' ? 'Resubmit to App Store' : 'Publish to App Store'}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Permissions Section */}
                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-4">Required Permissions</h3>
                  <PermissionsForm
                    permissions={formData.permissions || []}
                    onChange={handlePermissionsChange}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t p-6">
                <Button variant="outline" type="button" onClick={() => navigate('/tpas')}>
                  Back
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : "Save Changes"}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>

      {/* Dialogs */}
      {packageName && (
        <>
          <ApiKeyDialog
            tpa={formData}
            open={isApiKeyDialogOpen}
            onOpenChange={setIsApiKeyDialogOpen}
            apiKey={apiKey}
            orgId={currentOrg?.id}
          />

          <SharingDialog
            tpa={formData}
            open={isSharingDialogOpen}
            onOpenChange={setIsSharingDialogOpen}
            orgId={currentOrg?.id}
          />

          <PublishDialog
            tpa={formData}
            open={isPublishDialogOpen}
            onOpenChange={(open) => {
              setIsPublishDialogOpen(open);
            }}
            onPublishComplete={handlePublishComplete}
            orgId={currentOrg?.id}
          />

          {currentOrg && (
            <MoveOrgDialog
              tpa={formData}
              open={isMoveOrgDialogOpen}
              onOpenChange={setIsMoveOrgDialogOpen}
              eligibleOrgs={eligibleOrgs}
              currentOrgId={currentOrg.id}
              onMoveComplete={() => {
                // Handled by redirect in handleMoveToOrg
              }}
              onMove={handleMoveToOrg}
            />
          )}
        </>
      )}
    </DashboardLayout>
  );
};

export default EditTPA;