-- Create invoices table                                                                                                                                                                                 
  CREATE TABLE public.invoices (                                                                                                                                                                           
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,                                                                                                                                                         
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,                                                                                                                                     
    invoice_date DATE,                                                                                                                                                                                     
    biller TEXT,                                                                                                                                                                                           
    total DECIMAL(12,2),                                                                                                                                                                                   
    taxes DECIMAL(12,2),                                                                                                                                                                                   
    file_path TEXT NOT NULL,                                                                                                                                                                               
    file_name TEXT NOT NULL,                                                                                                                                                                               
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()                                                                                                                                                      
  );                                                                                                                                                                                                       
                                                                                                                                                                                                           
  -- Enable Row Level Security                                                                                                                                                                             
  ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;                                                                                                                                                   
                                                                                                                                                                                                           
  -- Policy: Users can only see their own invoices                                                                                                                                                         
  CREATE POLICY "Users can view own invoices"                                                                                                                                                              
    ON public.invoices                                                                                                                                                                                     
    FOR SELECT                                                                                                                                                                                             
    USING (auth.uid() = user_id);                                                                                                                                                                          
                                                                                                                                                                                                           
  -- Policy: Users can insert their own invoices                                                                                                                                                           
  CREATE POLICY "Users can insert own invoices"                                                                                                                                                            
    ON public.invoices                                                                                                                                                                                     
    FOR INSERT                                                                                                                                                                                             
    WITH CHECK (auth.uid() = user_id);                                                                                                                                                                     
                                                                                                 
  -- Policy: Users can delete their own invoices                                                 
  CREATE POLICY "Users can delete own invoices"                                                  
    ON public.invoices                                                                           
    FOR DELETE                                                                                   
    USING (auth.uid() = user_id);                                                                
                                                                                                 
  -- Storage policies for invoices bucket                                                        
  -- Policy: Users can upload to their own folder                                                
  CREATE POLICY "Users can upload invoices"                                                      
    ON storage.objects                                                                           
    FOR INSERT                                                                                   
    WITH CHECK (                                                                                 
      bucket_id = 'invoices'                                                                     
      AND auth.uid()::text = (storage.foldername(name))[1]                                       
    );                                                                                           
                                                                                                 
  -- Policy: Users can view their own invoices                                                   
  CREATE POLICY "Users can view own invoice files"                                               
    ON storage.objects                                                                           
    FOR SELECT                                                                                   
    USING (                                                                                      
      bucket_id = 'invoices'                                                                     
      AND auth.uid()::text = (storage.foldername(name))[1]                                       
    );                                                                                           
                                                                                                 
  -- Policy: Users can delete their own invoices                                                 
  CREATE POLICY "Users can delete own invoice files"    
    ON storage.objects                                  
    FOR DELETE                                          
    USING (                                             
      bucket_id = 'invoices'                            
      AND auth.uid()::text = (storage.foldername(name))[1]                                                       
    );                         