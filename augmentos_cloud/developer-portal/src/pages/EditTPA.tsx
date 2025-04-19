// pages/EditTPA.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircle2, AlertCircle, Loader2, KeyRound, Copy, RefreshCw, Share2, LinkIcon, Upload } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import api from '@/services/api.service';
import { TPA } from '@/types/tpa';
import { toast } from 'sonner';
import ApiKeyDialog from '../components/dialogs/ApiKeyDialog';
import SharingDialog from '../components/dialogs/SharingDialog';
import PublishDialog from '../components/dialogs/PublishDialog';
import { TpaType } from '@augmentos/sdk';
import { normalizeUrl } from '@/libs/utils';

const EditTPA: React.FC = () => {
  const navigate = useNavigate();
  const { packageName } = useParams<{ packageName: string }>();
  
  // Form state
  const [formData, setFormData] = useState<TPA>({
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
  });
  
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
  
  // Fetch TPA data from API
  useEffect(() => {
    const fetchTPA = async () => {
      if (!packageName) return;
      
      try {
        setIsLoading(true);
        setError(null);
        
        const tpaData = await api.apps.getByPackageName(packageName);
        
        // Convert API response to TPA type
        const tpa: TPA = {
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
      } catch (err) {
        console.error('Error fetching TPA:', err);
        setError('Failed to load TPA data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTPA();
  }, [packageName]);
  
  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
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
      
      // Normalize URLs before submission
      const normalizedData = {
        name: formData.name,
        description: formData.description,
        publicUrl: normalizeUrl(formData.publicUrl),
        logoURL: formData.logoURL,
        webviewURL: formData.webviewURL ? normalizeUrl(formData.webviewURL) : undefined
      };
      
      // Update TPA via API
      await api.apps.update(packageName, normalizedData);
      
      // Show success message
      setIsSaved(true);
      
      // Create a specific timeout ID to identify this toast
      const toastId = 'update-success-' + Date.now();
      toast.success('App updated successfully', { id: toastId });
      
      // Reset saved status after 3 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (err) {
      console.error('Error updating TPA:', err);
      setError('Failed to update App. Please try again.');
      toast.error('Failed to update App');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handle API key regeneration
  const handleRegenerateApiKey = async () => {
    try {
      setIsRegeneratingKey(true);
      if (!packageName) throw new Error('Package name is missing');
      
      const response = await api.apps.apiKey.regenerate(packageName);
      
      // Set the API key with the actual value from the server
      setApiKey(response.apiKey);
      
      // Dismiss any existing toasts first
      toast.dismiss();
      
      // Open the dialog to show the key - dialog itself will show success message
      setIsApiKeyDialogOpen(true);
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
    const allToasts = document.querySelectorAll('[role="status"]');
    allToasts.forEach(toast => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
    toast.dismiss();
    
    // Then open the dialog
    setIsApiKeyDialogOpen(true);
  };
  
  // Handle getting and copying share link
  const handleGetShareLink = async () => {
    if (!packageName) return;
    
    setIsLoadingShareLink(true);
    try {
      const link = await api.sharing.getInstallLink(packageName);
      setShareLink(link);
      
      // Open the sharing dialog
      setIsSharingDialogOpen(true);
    } catch (err) {
      console.error('Error getting share link:', err);
      toast.error('Failed to get share link');
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
    if (!packageName) return;
    
    try {
      // Just refresh the TPA data to get updated status
      const updatedTpa = await api.apps.getByPackageName(packageName);
      setFormData(prev => ({
        ...prev,
        appStoreStatus: updatedTpa.appStoreStatus
      }));
    } catch (err) {
      console.error('Error refreshing app data after publish:', err);
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
                    placeholder="https://yourserver.com" 
                  />
                  <p className="text-xs text-gray-500">
                    The base URL of your server where AugmentOS will communicate with your app.
                    We'll automatically append "/webhook" to handle events when your app is activated.
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
                    placeholder="https://yourserver.com/logo.png" 
                  />
                  <p className="text-xs text-gray-500">
                    URL to an image that will be used as your app's icon (recommended: 512x512 PNG).
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="webviewURL">Webview URL (Optional)</Label>
                  <Input 
                    id="webviewURL" 
                    name="webviewURL"
                    value={formData.webviewURL || ''}
                    onChange={handleChange}
                    placeholder="https://yourserver.com/webview" 
                  />
                  <p className="text-xs text-gray-500">
                    If your app has a companion mobile interface, provide the URL here.
                  </p>
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
                      variant="outline"
                      type="button" /* Explicitly set type to button to prevent form submission */
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
                
                {/* Share Section */}
                <div className="border rounded-md p-4 mt-6">
                  <h3 className="text-lg font-medium mb-2 flex items-center">
                    <Share2 className="h-5 w-5 mr-2" />
                    Share with Users
                  </h3>
                  
                  <p className="text-sm text-gray-600 mb-4">
                    Share your app with testers and keep track of who you've shared it with.
                  </p>
                  
                  <div className="flex items-center justify-end">
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
          />
          
          <SharingDialog
            tpa={formData}
            open={isSharingDialogOpen}
            onOpenChange={setIsSharingDialogOpen}
          />
          
          <PublishDialog
            tpa={formData}
            open={isPublishDialogOpen}
            onOpenChange={(open) => {
              setIsPublishDialogOpen(open);
            }}
            onPublishComplete={(updatedTpa) => {
              // Update the form data immediately with the new status
              setFormData(prev => ({
                ...prev,
                appStoreStatus: updatedTpa.appStoreStatus
              }));
              
              // Show success message that status has changed
              toast.success(`App status updated to: ${updatedTpa.appStoreStatus === 'SUBMITTED' ? 'Submitted for Review' : updatedTpa.appStoreStatus}`);
            }}
          />
        </>
      )}
    </DashboardLayout>
  );
};

export default EditTPA;