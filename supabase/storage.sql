-- Private source/preview/export bucket and size-limited staging bucket.
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('passlist-private','passlist-private',false,134217728),
      ('passlist-uploads','passlist-uploads',false,10485760)
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit;
-- Do not add anon/authenticated policies to either bucket.
